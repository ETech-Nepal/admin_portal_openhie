import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { issueSession } from '../lib/token.js';
import { logger } from '../lib/logger.js';

export const authRouter = Router();

// Brute-force guard on the only unauthenticated surface.
// NOTE: the default in-memory store resets on restart and is per-replica — move it to
// a shared store (Redis) before running more than one instance.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Constant-time compare so a wrong password can't be discovered by timing.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  const ok = typeof username === 'string' && typeof password === 'string'
    && safeEqual(username, config.ADMIN_USERNAME)
    && safeEqual(password, config.ADMIN_PASSWORD);

  if (!ok) {
    logger.warn({ username, ip: req.ip }, 'failed admin login');
    // Generic message: never reveal which half was wrong.
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const token = await issueSession(username);
  logger.info({ username }, 'admin signed in');
  res.json({ token, username, expiresIn: config.SESSION_TTL_SECONDS });
});
