import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorized } from './_lib/auth.js';
import { safeUrl } from './_lib/ssrf.js';
import { pagespeed } from './_lib/psi.js';
import { analyzeLanding, landingUnreachable, scoreFrom } from './_lib/landing.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req, res)) return;
  const b = (req.method === 'POST' ? req.body : req.query) ?? {};
  const u = await safeUrl(String(b.url ?? ''));
  if (!u) return res.status(400).json({ error: 'URL non valido' });
  const ctx = { name: String(b.name ?? 'l\'attività').slice(0, 80), category: String(b.category ?? 'servizio').slice(0, 40) };

  const psi = pagespeed(u.toString());
  let a;
  try {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadFinderBot/0.1)', 'Accept-Language': 'it' } });
    a = r.ok ? analyzeLanding(u.toString(), (await r.text()).slice(0, 1_500_000), r.url || u.toString(), ctx) : landingUnreachable(u.toString(), ctx);
  } catch { a = landingUnreachable(u.toString(), ctx); }

  if (a.reachable) {
    a.pagespeed = await psi;
    const p = a.pagespeed?.performance;
    if (p !== undefined && p < 0.8) {
      a.issues.push(p < 0.5
        ? { severity: 'alta', problem: `Landing lenta da mobile (${Math.round(p * 100)}/100): una quota dei clic a pagamento se ne va prima che la pagina si carichi`, proposal: 'Comprimere immagini (WebP), togliere script inutili, usare hosting veloce' }
        : { severity: 'media', problem: `Velocità mobile migliorabile (${Math.round(p * 100)}/100)`, proposal: 'Ottimizzare immagini e script' });
      a.score = scoreFrom(a.issues.filter((i) => !i.problem.startsWith('Landing lenta') && !i.problem.startsWith('Velocità mobile')), p);
    }
  }
  return res.status(200).json(a);
}
