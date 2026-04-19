import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { GOOGLE_CLIENT_ID, JWT_SECRET, JWT_EXPIRES_IN, ALLOWED_EMAILS } from '../config';

const router = Router();
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

router.post('/google', async (req: Request, res: Response): Promise<void> => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400).json({ error: 'Missing credential' });
    return;
  }
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!ALLOWED_EMAILS.includes(payload.email)) {
      res.status(403).json({ error: 'Access denied. Only carnesbinefar.es accounts allowed.' });
      return;
    }
    const token = jwt.sign(
      { email: payload.email, name: payload.name || payload.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token, email: payload.email, name: payload.name });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

router.get('/me', (req: Request, res: Response): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { email: string; name: string };
    res.json(payload);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
