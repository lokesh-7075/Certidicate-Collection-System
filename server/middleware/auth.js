import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'Missing auth token' });

    const payload = jwt.verify(token, JWT_SECRET);
    // payload: { uid, role }
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: e?.message || 'Invalid token' });
  }
}

export function signToken(payload) {
  const JWT_SECRET_IN = process.env.JWT_SECRET || 'dev-secret-change-me';
  const token = jwt.sign(payload, JWT_SECRET_IN, { expiresIn: '7d' });
  return token;
}

