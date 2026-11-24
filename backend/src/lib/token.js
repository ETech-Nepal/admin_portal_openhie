import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secret = new TextEncoder().encode(config.SESSION_JWT_SECRET);
const ISSUER = 'nepal-admin-portal';

export async function issueSession(username) {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${config.SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token) {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
  return payload;
}
