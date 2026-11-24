import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorized } from './_lib/auth.js';

/**
 * Cerca annunci ATTIVI in Italia nella Meta Ad Library (API ufficiale, gratuita ma con token:
 * META_AD_LIBRARY_TOKEN, ottenibile da un account sviluppatore Meta verificato).
 * Senza token risponde con `needsToken` e il frontend offre il link diretto alla Ads Library.
 */
const LEAD_RE = /(compila|modulo|richiedi|preventiv|prenot|iscriv|registrati|contattaci|candidati|consulenza|gratis|gratuit|scarica)/i;

function norm(s: string) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req, res)) return;
  const name = String(req.query.name ?? '').trim();
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Nome non valido' });
  const libraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IT&q=${encodeURIComponent(name)}&search_type=keyword_unordered&media_type=all`;
  const token = process.env.META_AD_LIBRARY_TOKEN;
  if (!token) return res.status(200).json({ needsToken: true, libraryUrl, ads: [] });

  const qs = new URLSearchParams({
    access_token: token, search_terms: name, ad_reached_countries: '["IT"]', ad_active_status: 'ACTIVE', ad_type: 'ALL', limit: '50',
    fields: 'page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_creative_link_descriptions,ad_delivery_start_time,ad_snapshot_url,publisher_platforms',
  });
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/ads_archive?${qs}`, { signal: AbortSignal.timeout(20000) });
    const d = (await r.json()) as { data?: Record<string, unknown>[]; error?: { message: string } };
    if (!r.ok || d.error) return res.status(502).json({ error: d.error?.message ?? `Meta ha risposto ${r.status}`, libraryUrl });
    const key = norm(name);
    const ads = (d.data ?? [])
      .filter((a) => { const p = norm(String(a.page_name ?? '')); return p && (p.includes(key) || key.includes(p)); })
      .map((a) => {
        const text = [...((a.ad_creative_bodies as string[]) ?? []), ...((a.ad_creative_link_titles as string[]) ?? []), ...((a.ad_creative_link_descriptions as string[]) ?? [])].join(' ');
        const captions = ((a.ad_creative_link_captions as string[]) ?? []).filter(Boolean);
        return {
          pageName: a.page_name, startedAt: a.ad_delivery_start_time, platforms: a.publisher_platforms ?? [], snapshotUrl: a.ad_snapshot_url,
          text: text.slice(0, 400), landingHints: [...new Set(captions)], leadGenLikely: LEAD_RE.test(text),
        };
      });
    return res.status(200).json({ needsToken: false, libraryUrl, count: ads.length, ads });
  } catch (e) { return res.status(504).json({ error: 'Ads Library non raggiungibile', detail: String(e), libraryUrl }); }
}
