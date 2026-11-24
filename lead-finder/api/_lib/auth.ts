import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Se LEAD_FINDER_TOKEN è impostato, richiede `Authorization: Bearer <token>`. */
export function authorized(req: VercelRequest, res: VercelResponse): boolean {
  const token = process.env.LEAD_FINDER_TOKEN;
  if (!token) return true;
  if (req.headers.authorization === `Bearer ${token}`) return true;
  res.status(401).json({ error: 'Non autorizzato' });
  return false;
}
