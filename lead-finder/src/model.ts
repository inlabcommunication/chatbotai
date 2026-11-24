export type Status = 'nuovo' | 'analizzato' | 'selezionato' | 'inviato' | 'risposto' | 'call' | 'proposta' | 'cliente' | 'perso';
export const STATUSES: Status[] = ['nuovo', 'analizzato', 'selezionato', 'inviato', 'risposto', 'call', 'proposta', 'cliente', 'perso'];
export const STATUS_LABEL: Record<Status, string> = {
  nuovo: 'Nuovo', analizzato: 'Analizzato', selezionato: 'Da contattare', inviato: 'Messaggio inviato', risposto: 'Ha risposto',
  call: 'Call fissata', proposta: 'Proposta inviata', cliente: 'Cliente', perso: 'Perso / no',
};

export interface Issue { severity: 'alta' | 'media' | 'bassa'; problem: string; proposal: string }
export interface SiteAudit {
  url: string; reachable: boolean; score: number; issues: Issue[]; responseMs: number; title: string;
  emails: string[]; phones: string[]; social: Record<string, string | undefined>; builder: string; hasMenuOrBooking: boolean;
  pagespeed?: { performance: number; seo: number; accessibility: number; bestPractices: number };
}
export interface LandingAudit {
  url: string; reachable: boolean; score: number; issues: Issue[];
  forms: { count: number; maxFields: number }; tracking: { metaPixel: boolean; gtm: boolean; ga: boolean };
  hasPhoneOrWhatsapp: boolean; outboundLinks: number;
  pagespeed?: { performance: number; seo: number; accessibility: number; bestPractices: number };
  proposal: { section: string; content: string }[];
}
export interface Ad { pageName: string; startedAt?: string; platforms: string[]; snapshotUrl?: string; text: string; landingHints: string[]; leadGenLikely: boolean }
export interface AdsInfo { checkedAt: string; needsToken: boolean; libraryUrl: string; ads: Ad[] }
export interface SocialInfo { url: string; blocked: boolean; network?: string; title?: string; description?: string; followers?: number; posts?: number; likes?: number; notes?: string[]; checkedAt?: string }
export interface Outreach { whatsapp: string; email_subject: string; email_body: string; instagram_dm: string }

export interface Lead {
  id: string; name: string; category: string; address: string; city: string; postcode: string;
  phone: string; email: string; website: string; instagram: string; facebook: string; openingHours: string;
  lat: number | null; lon: number | null;
  region: string; province: string; comune: string; place: string;
  status: Status; notes: string; createdAt: string;
  audit?: SiteAudit; auditedAt?: string;
  ads?: AdsInfo; landings?: LandingAudit[]; runsAds?: boolean;
  social?: Record<string, SocialInfo>;
  outreach?: Outreach; message?: string;
  callReport?: string; doNotContact?: boolean;
  contactedAt?: string; followUpAt?: string; callAt?: string;
  updatedAt?: string;
}

export function hasSite(l: Lead) { return !!l.website; }
export function igHandle(l: Lead): string {
  const raw = l.instagram || l.audit?.social.instagram || '';
  return raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
}
export function fbHandle(l: Lead): string {
  const raw = l.facebook || l.audit?.social.facebook || '';
  return raw.replace(/^https?:\/\/(www\.)?facebook\.com\//i, '').replace(/[/?#].*$/, '');
}

/** 0-100: quanto è facile e sensato proporgli qualcosa. */
export function opportunity(l: Lead): { score: number; reasons: string[] } {
  let s = 0; const r: string[] = [];
  if (!l.website) { s += 40; r.push('Nessun sito web'); }
  if (l.audit) {
    if (!l.audit.reachable) { s += 40; r.push('Sito non raggiungibile'); }
    else { s += Math.round((10 - l.audit.score) * 4); if (l.audit.score <= 5) r.push(`Sito scadente (${l.audit.score}/10)`); }
  }
  const running = l.runsAds || (l.ads?.ads.length ?? 0) > 0;
  if (running) {
    s += 15; r.push('Fa sponsorizzate');
    const worst = l.landings?.length ? Math.min(...l.landings.map((x) => x.score)) : undefined;
    if (worst !== undefined && worst <= 6) { s += 20; r.push(`Landing scadente (${worst}/10)`); }
  }
  const ig = l.social?.instagram;
  if (!igHandle(l) && !fbHandle(l)) { s += 15; r.push('Nessun social'); }
  else if (ig && !ig.blocked && ((ig.posts ?? 99) < 30 || (ig.followers ?? 9999) < 500)) { s += 10; r.push('Instagram poco sviluppato'); }
  if (mobileWhatsApp(l)) { s += 15; r.push('Raggiungibile su WhatsApp'); }
  if (l.email || l.audit?.emails.length) s += 5;
  if (l.doNotContact) s = 0;
  return { score: Math.min(100, s), reasons: r };
}

/** Numero in formato internazionale se è un cellulare italiano (i fissi non hanno WhatsApp), altrimenti null. */
export function mobileWhatsApp(l: Pick<Lead, 'phone' | 'audit'>): string | null {
  const cands = [...(l.phone ? l.phone.split(/[;,/]/) : []), ...(l.audit?.phones ?? [])];
  for (const c of cands) {
    let d = c.replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2);
    if (/^3\d{8,9}$/.test(d)) d = '39' + d;
    if (/^393\d{8,9}$/.test(d)) return d;
  }
  return null;
}
export const waLink = (l: Lead, text: string) => { const n = mobileWhatsApp(l); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null; };
export const emailOf = (l: Lead) => l.email || l.audit?.emails[0] || '';
export const mailLink = (l: Lead, subject: string, body: string) => `mailto:${emailOf(l)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const OPTOUT = 'Se preferite non essere contattati, scrivetemelo e non vi disturbo più.';
export function draftMessage(l: Lead): string {
  const running = l.runsAds || l.ads?.ads.length;
  const lpProblem = l.landings?.slice().sort((a, b) => a.score - b.score)[0]?.issues.find((i) => i.severity === 'alta');
  const top = l.audit?.issues.find((i) => i.severity === 'alta') ?? l.audit?.issues[0];
  const intro = 'Buongiorno, sono Nicola di InLab, mi occupo di visibilità online per attività locali.';
  if (running) return `${intro} Ho visto che ${l.name} fa pubblicità online${lpProblem ? ` e che la pagina a cui portano gli annunci ha un problema: ${lpProblem.problem.toLowerCase()}` : ''}. Posso farvi gratis un breve report su come far rendere meglio ogni euro investito? ${OPTOUT}`;
  if (!l.website || (l.audit && !l.audit.reachable)) return `${intro} Cercando ${l.name} online non sono riuscito a trovare un sito web funzionante: molti clienti scelgono guardando prima online. Posso mostrarvi gratis un'idea di come potrebbe essere? ${OPTOUT}`;
  if (top) return `${intro} Ho dato un'occhiata al sito di ${l.name} e ho notato una cosa: ${top.problem.toLowerCase()}. Posso farvi gratis un breve report con 3 idee concrete per migliorare? ${OPTOUT}`;
  return `${intro} Ho dato un'occhiata alla presenza online di ${l.name} e vedo margini di miglioramento. Posso mandarvi gratis un breve report con 3 idee? ${OPTOUT}`;
}

/** Riepilogo compatto di un lead, da dare all'AI. */
export function leadBrief(l: Lead): string {
  const o = opportunity(l);
  const L = [`${l.name} (${l.category}) — ${[...new Set([l.comune || l.city, l.province, l.region].filter(Boolean))].join(', ')} — stato: ${l.status} — opportunità ${o.score}/100 (${o.reasons.join('; ') || 'n/d'})`];
  L.push(`Contatti: tel ${l.phone || 'n/d'}, email ${emailOf(l) || 'n/d'}, sito ${l.website || 'NESSUNO'}`);
  if (l.audit) L.push(`Sito: voto ${l.audit.score}/10 — ${l.audit.issues.slice(0, 5).map((i) => i.problem).join('; ')}`);
  if (l.social) for (const [k, v] of Object.entries(l.social)) if (!v.blocked) L.push(`${k}: ${v.followers ?? '?'} follower, ${v.posts ?? '?'} post. ${v.notes?.join('; ') ?? ''}`);
  if (l.ads?.ads.length) L.push(`Ads attive: ${l.ads.ads.length}${l.ads.ads.some((a) => a.leadGenLikely) ? ' (probabile lead generation)' : ''}`);
  if (l.landings?.length) L.push(`Landing: ${l.landings.map((x) => `${x.url} voto ${x.score}/10 — ${x.issues.slice(0, 4).map((i) => i.problem).join('; ')}`).join(' | ')}`);
  if (l.notes) L.push(`Note: ${l.notes}`);
  return L.join('\n');
}
