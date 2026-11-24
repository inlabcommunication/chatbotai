import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Dice all'interfaccia quali collegamenti sono configurati (solo true/false, mai i valori). */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const e = process.env;
  const authOk = !e.LEAD_FINDER_TOKEN || req.headers.authorization === `Bearer ${e.LEAD_FINDER_TOKEN}`;
  res.status(200).json({
    tokenRequired: !!e.LEAD_FINDER_TOKEN,
    authorized: authOk,
    ai: !!e.ANTHROPIC_API_KEY,
    adsLibrary: !!e.META_AD_LIBRARY_TOKEN,
    pagespeedKey: !!e.PAGESPEED_API_KEY,
  });
}
