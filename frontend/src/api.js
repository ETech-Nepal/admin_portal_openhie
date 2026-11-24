const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4200';

const KEY = 'admin-session';
export const session = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set: (s) => localStorage.setItem(KEY, JSON.stringify(s)),
  clear: () => localStorage.removeItem(KEY),
};

async function call(path, { method = 'GET', body } = {}) {
  const s = session.get();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // The mediator's MERGE_PARTIAL detail matters to the operator — keep it attached.
    const err = new Error(data?.error || data?.detail || `request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    if (res.status === 401) session.clear();
    throw err;
  }
  return data;
}

export const api = {
  login: (username, password) => call('/auth/login', { method: 'POST', body: { username, password } }),
  listTasks: (status = 'OPEN') => call(`/review/tasks?status=${encodeURIComponent(status)}`),
  getTask: (id) => call(`/review/tasks/${encodeURIComponent(id)}`),
  merge: (id, survivorUid) => call(`/review/tasks/${encodeURIComponent(id)}/merge`, { method: 'POST', body: { survivorUid } }),
  dismiss: (id, reason) => call(`/review/tasks/${encodeURIComponent(id)}/dismiss`, { method: 'POST', body: { reason } }),
  scan: () => call('/review/scan', { method: 'POST' }),
};
