import { call } from './api';
import { igHandle, fbHandle, type Lead, type SiteAudit, type SocialInfo, type AdsInfo, type LandingAudit } from './model';

const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export async function auditSite(l: Lead): Promise<Partial<Lead>> {
  const status = l.status === 'nuovo' ? { status: 'analizzato' as const } : {};
  if (!l.website) return status;
  const audit = await call<SiteAudit>('/api/audit', { url: l.website });
  return { audit, auditedAt: now(), ...status };
}
export async function checkSocial(l: Lead, net: 'instagram' | 'facebook'): Promise<Partial<Lead>> {
  const handle = net === 'instagram' ? igHandle(l) : fbHandle(l);
  if (!handle) return {};
  const info = await call<SocialInfo>(`/api/social?network=${net}&profile=${encodeURIComponent(handle)}`);
  return { social: { ...(l.social ?? {}), [net]: info } };
}
export async function checkAds(l: Lead): Promise<Partial<Lead>> {
  const d = await call<Omit<AdsInfo, 'checkedAt'>>(`/api/ads?name=${encodeURIComponent(l.name)}`);
  return { ads: { ...d, checkedAt: now() } };
}
export async function analyzeLanding(l: Lead, url: string): Promise<Partial<Lead>> {
  const d = await call<LandingAudit>('/api/landing', { url, name: l.name, category: l.category });
  return { landings: [...(l.landings ?? []).filter((x) => x.url !== d.url), d], runsAds: true };
}
/** Analisi completa usata nelle operazioni in blocco: sito + social (gli errori sui social non bloccano). */
export async function fullAnalysis(l: Lead): Promise<Partial<Lead>> {
  let p: Partial<Lead> = await auditSite(l);
  let cur = { ...l, ...p };
  for (const net of ['instagram', 'facebook'] as const) {
    try { const s = await checkSocial(cur, net); cur = { ...cur, ...s }; p = { ...p, ...s }; } catch { /* social non raggiungibili */ }
  }
  return p;
}
