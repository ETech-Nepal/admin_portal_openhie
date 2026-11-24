import { verifySession } from '../lib/token.js';

export async function requireAdmin(req, res, next) {
  const auth = req.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing session token' });

  try {
    const payload = await verifySession(token);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'not an admin session' });
    // Carried to the mediator as X-Admin-User so every merge is attributed to a person.
    req.admin = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired session' });
  }
}
