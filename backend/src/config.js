import 'dotenv/config';
import { z } from 'zod';

// NOT z.coerce.boolean(): it applies JS truthiness, so the string 'false' from an env
// var coerces to TRUE. Env booleans must be parsed by value.
const bool = (def) =>
  z.enum(['true', 'false', '1', '0']).default(def).transform((s) => s === 'true' || s === '1');

const schema = z.object({
  PORT: z.coerce.number().default(4200),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:8091'),

  // OpenHIM transaction port + the admin channel this BFF is allowed to call.
  OPENHIM_ADMIN_URL: z.string().url(),
  OPENHIM_TRUST_SELF_SIGNED: bool('true'),
  // The URL clients use for OpenHIM (its PUBLIC_BASE_URL); DPoP proofs must name it.
  OPENHIM_PUBLIC_BASE_URL: z.string().url(),
  OPENHIM_CLIENT_ID: z.string().min(1).default('admin-portal'),
  OPENHIM_CLIENT_KEY_PATH: z.string().min(1),
  KEYCLOAK_TOKEN_URL: z.string().url(),
  KEYCLOAK_ISSUER: z.string().url(),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().default(60000),

  // Admin sign-in. Dev-only credential pair; see the Keycloak note in README.
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8),
  SESSION_JWT_SECRET: z.string().min(16),
  SESSION_TTL_SECONDS: z.coerce.number().default(3600),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid env config:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
