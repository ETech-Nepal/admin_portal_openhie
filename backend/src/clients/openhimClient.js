import axios from 'axios';
import https from 'node:https';
import { config } from '../config.js';
import { createServiceToken } from './serviceToken.js';

// The BFF talks to the identity mediator ONLY through OpenHIM's /admin channel,
// authenticated as the Keycloak client `admin-portal` (private_key_jwt + DPoP; OpenHIM
// accepts nothing else).
//
// The browser never holds this credential. It also means every merge is recorded in
// OpenHIM's transaction log, which is the audit trail for an irreversible change to
// patient identity — the reason the UI does not call the mediator directly.
const client = axios.create({
  baseURL: config.OPENHIM_ADMIN_URL,
  timeout: config.UPSTREAM_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
  httpsAgent: config.OPENHIM_TRUST_SELF_SIGNED ? new https.Agent({ rejectUnauthorized: false }) : undefined,
});

const authHeaders = createServiceToken({
  tokenUrl: config.KEYCLOAK_TOKEN_URL,
  audience: config.KEYCLOAK_ISSUER,
  clientId: config.OPENHIM_CLIENT_ID,
  keyPath: config.OPENHIM_CLIENT_KEY_PATH,
});

// OpenHIM checks the DPoP proof's htu against its public URL, not the internal one the
// BFF actually calls, so the proof names OPENHIM_PUBLIC_BASE_URL plus the path.
client.interceptors.request.use(async (cfg) => {
  const url = `${config.OPENHIM_PUBLIC_BASE_URL.replace(/\/$/, '')}${cfg.url}`;
  Object.assign(cfg.headers, await authHeaders(cfg.method ?? 'get', url));
  return cfg;
});

// OpenHIM unwraps the mediator envelope for us — it returns `response.body` to the
// caller — but only when the mediator's reply carries Content-Type
// application/json+openhim. If that header is ever lost, the raw envelope arrives here
// instead and every field lookup silently misses. Unwrap defensively so a header
// regression surfaces as working software rather than mystifying blank screens.
client.interceptors.response.use((res) => {
  const d = res.data;
  if (d && typeof d === 'object' && d['x-mediator-urn'] && d.response) {
    const body = d.response.body;
    res.data = typeof body === 'string' ? JSON.parse(body) : body;
  }
  return res;
});

// `admin` identifies the signed-in human; the mediator stores it as the task's
// resolvedBy. Derived from the verified session server-side — never from the browser.
const asAdmin = (admin) => ({ headers: { 'X-Admin-User': admin } });

export async function listTasks({ status, limit, offset }, admin) {
  const { data } = await client.get('/admin/review/tasks', { params: { status, limit, offset }, ...asAdmin(admin) });
  return data;
}

export async function getTask(id, admin) {
  const { data } = await client.get(`/admin/review/tasks/${encodeURIComponent(id)}`, asAdmin(admin));
  return data;
}

export async function mergeTask(id, survivorUid, admin) {
  const { data } = await client.post(`/admin/review/tasks/${encodeURIComponent(id)}/merge`, { survivorUid }, asAdmin(admin));
  return data;
}

export async function dismissTask(id, reason, admin) {
  const { data } = await client.post(`/admin/review/tasks/${encodeURIComponent(id)}/dismiss`, { reason }, asAdmin(admin));
  return data;
}

export async function runScan(admin) {
  const { data } = await client.post('/admin/review/scan', {}, asAdmin(admin));
  return data;
}
