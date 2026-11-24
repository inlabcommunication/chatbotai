import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorized } from './_lib/auth.js';

/**
 * Legge dall'esterno le informazioni PUBBLICHE di un profilo Instagram/Facebook
 * (anteprima Open Graph: follower, post, mi piace). Non fa login. Instagram può rifiutare le richieste dai server:
 * in quel caso risponde `blocked` e l'app propone l'apertura manuale del profilo.
 */
const num = (s?: string) => {
  if (!s) return undefined;
  const m = s.trim().replace(/\s/g, '').match(/^([\d.,]+)([KkMm]?)$/);
  if (!m) return undefined;
  let n = parseFloat(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  if (/k/i.test(m[2])) n *= 1e3; if (/m/i.test(m[2])) n *= 1e6;
  return Math.round(n);
};
const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1] ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req, res)) return;
  let raw = String(req.query.profile ?? '').trim();
  const net = String(req.query.network ?? 'instagram');
  if (!/^(instagram|facebook)$/.test(net)) return res.status(400).json({ error: 'Rete non supportata' });
  raw = raw.replace(/^https?:\/\/(www\.)?(instagram|facebook)\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  if (!/^[a-z0-9._-]{2,60}$/i.test(raw)) return res.status(400).json({ error: 'Profilo non valido' });
  const url = `https://www.${net}.com/${raw}/`;
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Accept-Language': 'it,en;q=0.8' } });
    const html = (await r.text()).slice(0, 600_000);
    const desc = meta(html, 'og:description') || meta(html, 'description');
    const title = meta(html, 'og:title');
    if (!r.ok || (!desc && !title) || /login/i.test(new URL(r.url).pathname)) return res.status(200).json({ url, blocked: true });
    const followers = num(desc.match(/([\d.,]+\s?[KkMm]?)\s+(?:followers?|follower)/i)?.[1]) ;
    const posts = num(desc.match(/([\d.,]+\s?[KkMm]?)\s+(?:posts?|post|pubblicazioni)/i)?.[1]);
    const likes = num(desc.match(/([\d.,]+\s?[KkMm]?)\s+(?:likes?|mi piace)/i)?.[1]);
    const notes: string[] = [];
    if (net === 'instagram') {
      if (followers !== undefined && followers < 500) notes.push('Pochi follower: profilo poco sviluppato');
      if (posts !== undefined && posts < 30) notes.push('Pochi post pubblicati: contenuti scarsi');
      if (followers !== undefined && posts !== undefined && posts > 0 && followers / posts < 3) notes.push('Rapporto follower/post basso: poco seguito rispetto a quanto pubblica');
    } else if (likes !== undefined && likes < 300) notes.push('Pagina con pochi mi piace');
    return res.status(200).json({ url, blocked: false, network: net, title, description: desc.slice(0, 300), followers, posts, likes, notes, checkedAt: new Date().toISOString() });
  } catch { return res.status(200).json({ url, blocked: true }); }
}
