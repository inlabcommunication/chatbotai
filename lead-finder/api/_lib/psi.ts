export interface Pagespeed { performance: number; seo: number; accessibility: number; bestPractices: number }

export async function pagespeed(url: string): Promise<Pagespeed | undefined> {
  const qs = new URLSearchParams({ url, strategy: 'mobile' });
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) qs.append('category', c);
  if (process.env.PAGESPEED_API_KEY) qs.set('key', process.env.PAGESPEED_API_KEY);
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(22000) });
    if (!r.ok) return undefined;
    const c = ((await r.json()) as { lighthouseResult?: { categories?: Record<string, { score: number | null }> } }).lighthouseResult?.categories;
    if (!c) return undefined;
    return { performance: c.performance?.score ?? 0, seo: c.seo?.score ?? 0, accessibility: c.accessibility?.score ?? 0, bestPractices: c['best-practices']?.score ?? 0 };
  } catch { return undefined; }
}
