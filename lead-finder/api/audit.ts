import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorized } from './_lib/auth.js';
import { safeUrl } from './_lib/ssrf.js';
import { pagespeed } from './_lib/psi.js';
import { analyzeHtml, finalizeScore, unreachable, type SiteAudit } from './_lib/analyze.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req, res)) return;
  const input = String((req.method === 'POST' ? req.body?.url : req.query.url) ?? '');
  const u = await safeUrl(input);
  if (!u) return res.status(400).json({ error: 'URL non valido' });

  const t0 = Date.now();
  const psi = pagespeed(u.toString());
  let audit: SiteAudit;
  try {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadFinderBot/0.1)', 'Accept-Language': 'it' } });
    const ms = Date.now() - t0;
    if (!r.ok) audit = unreachable(u.toString());
    else {
      const html = (await r.text()).slice(0, 1_500_000);
      audit = analyzeHtml(u.toString(), html, ms, r.url || u.toString());
    }
  } catch { audit = unreachable(u.toString()); }

  if (audit.reachable) {
    audit.pagespeed = await psi;
    if (audit.pagespeed) {
      const p = audit.pagespeed.performance;
      if (p < 0.5) audit.issues.push({ severity: 'alta', problem: `Velocità mobile molto bassa (${Math.round(p * 100)}/100)`, proposal: 'Ottimizzare immagini, script e caching: un sito lento perde clienti' });
      else if (p < 0.8) audit.issues.push({ severity: 'media', problem: `Velocità mobile migliorabile (${Math.round(p * 100)}/100)`, proposal: 'Comprimere le immagini e ridurre gli script' });
      audit.score = finalizeScore(audit.issues.filter((i) => !i.problem.startsWith('Velocità mobile')));
      audit.score = Math.max(0, audit.score - (p < 0.5 ? 1.5 : p < 0.8 ? 0.5 : 0));
    }
  }
  return res.status(200).json(audit);
}
