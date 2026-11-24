export type Status = 'nuovo' | 'analizzato' | 'selezionato' | 'inviato' | 'risposto' | 'call' | 'proposta' | 'cliente' | 'perso';
export const STATUSES: Status[] = ['nuovo', 'analizzato', 'selezionato', 'inviato', 'risposto', 'call', 'proposta', 'cliente', 'perso'];

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
export interface Lead {
  id: string; name: string; category: string; address: string; city: string; postcode: string;
  phone: string; email: string; website: string; instagram: string; facebook: string; openingHours: string;
  lat: number | null; lon: number | null;
  place: string; // zona cercata
  status: Status; notes: string; audit?: SiteAudit; auditedAt?: string;
  ads?: AdsInfo; landings?: LandingAudit[]; runsAds?: boolean; // runsAds: confermato a mano dalla Ads Library
  contactedAt?: string; followUpAt?: string; callAt?: string;
}

/** 0-100: quanto è facile e sensato proporgli qualcosa. */
export function opportunity(l: Lead): { score: number; reasons: string[] } {
  let s = 0; const r: string[] = [];
  if (!l.website && !l.audit) { s += 40; r.push('Nessun sito web noto'); }
  if (l.audit) {
    if (!l.audit.reachable) { s += 40; r.push('Sito non raggiungibile'); }
    else { const p = Math.round((10 - l.audit.score) * 4); s += p; if (l.audit.score <= 5) r.push(`Sito scadente (${l.audit.score}/10)`); }
  }
  const running = l.runsAds || (l.ads?.ads.length ?? 0) > 0;
  if (running) {
    s += 15; r.push('Fa sponsorizzate (budget già investito)');
    const worst = l.landings?.length ? Math.min(...l.landings.map((x) => x.score)) : undefined;
    if (worst !== undefined && worst <= 6) { s += 20; r.push(`Landing scadente (${worst}/10): spreca i clic a pagamento`); }
  }
  const ig = l.instagram || l.audit?.social.instagram;
  if (!ig && !l.facebook && !l.audit?.social.facebook) { s += 15; r.push('Nessun social collegato'); }
  if (mobileWhatsApp(l)) { s += 15; r.push('Cellulare disponibile per WhatsApp'); }
  if (l.email || l.audit?.emails.length) { s += 5; r.push('Email trovata'); }
  if (l.openingHours) s += 5;
  return { score: Math.min(100, s), reasons: r };
}

/** Numero WhatsApp in formato internazionale se è un cellulare italiano, altrimenti null. */
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

export function waLink(l: Lead, text: string): string | null {
  const n = mobileWhatsApp(l);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export function draftMessage(l: Lead): string {
  const top = l.audit?.issues.filter((i) => i.severity === 'alta')[0] ?? l.audit?.issues[0];
  const hook = !l.website && !l.audit?.reachable
    ? `ho cercato ${l.name} online e non sono riuscito a trovare un sito web`
    : top ? `ho dato un'occhiata al sito di ${l.name} e ho notato una cosa: ${top.problem.toLowerCase()}` : `ho dato un'occhiata alla presenza online di ${l.name}`;
  if (l.runsAds || l.ads?.ads.length) {
    const lp = l.landings?.slice().sort((a, b) => a.score - b.score)[0]?.issues.find((i) => i.severity === 'alta');
    return `Buongiorno, sono Nicola di InLab. Ho visto che ${l.name} sta facendo pubblicità online${lp ? ` e che la pagina a cui portano gli annunci ha un problema: ${lp.problem.toLowerCase()}` : ''}. Posso farvi gratuitamente un breve report su come far rendere meglio ogni euro investito? Se preferite non essere contattati, scrivetemelo e non vi disturbo più.`;
  }
  return `Buongiorno, sono Nicola di InLab. Mi occupo di siti e visibilità online per attività locali: ${hook}. Posso farvi gratuitamente un breve report con 3 idee concrete per migliorare. Vi interessa? Se preferite non essere contattati, scrivetemelo e non vi disturbo più.`;
}
