export interface Issue { severity: 'alta' | 'media' | 'bassa'; problem: string; proposal: string }
export interface SiteAudit {
  url: string;
  reachable: boolean;
  score: number; // 0-10
  issues: Issue[];
  responseMs: number;
  title: string;
  emails: string[];
  phones: string[];
  social: { instagram?: string; facebook?: string; tiktok?: string; linkedin?: string; youtube?: string };
  builder: string;
  hasMenuOrBooking: boolean;
  pagespeed?: { performance: number; seo: number; accessibility: number; bestPractices: number };
}

const PEN = { alta: 2, media: 1, bassa: 0.5 } as const;

export function analyzeHtml(url: string, html: string, responseMs: number, finalUrl: string): SiteAudit {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], problem: string, proposal: string) => issues.push({ severity, problem, proposal });
  const lower = html.toLowerCase();
  const year = new Date().getFullYear();

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();

  if (!finalUrl.startsWith('https://')) add('alta', 'Il sito non usa HTTPS (browser mostra "non sicuro")', 'Attivare il certificato SSL e reindirizzare tutto su HTTPS');
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) add('alta', 'Nessun meta viewport: il sito non è adattato al mobile', 'Rifare il layout responsive: oltre il 70% dei clienti locali arriva da smartphone');
  if (!title || title.length < 10) add('media', 'Titolo della pagina assente o troppo breve', 'Scrivere un title con attività + città + servizio principale');
  if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{30,}/i.test(html)) add('media', 'Meta description mancante', 'Aggiungere una descrizione di 120-155 caratteri che invogli al clic su Google');
  if (!/<h1[\s>]/i.test(html)) add('bassa', 'Nessun titolo H1', 'Inserire un H1 chiaro con servizio e località');
  if (!/property=["']og:/i.test(html)) add('bassa', 'Mancano le anteprime social (Open Graph)', 'Aggiungere og:title/og:image per bei link condivisi su WhatsApp e social');

  const legacy: string[] = [];
  if (/<(font|marquee|center|frameset|blink)[\s>]/i.test(html)) legacy.push('tag HTML obsoleti');
  if (/\.swf|<object[^>]+flash/i.test(html)) legacy.push('Flash');
  if ((html.match(/<table/gi) ?? []).length > 5) legacy.push('layout a tabelle');
  if (/jquery[-.]?(1\.|2\.)/i.test(html)) legacy.push('jQuery vecchio');
  if (legacy.length) add('alta', `Tecnologia datata (${legacy.join(', ')})`, 'Rifare il sito con una struttura moderna, veloce e sicura');

  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^<]{0,40}?(20\d{2}|19\d{2})/gi)].map((m) => Number(m[1]));
  if (years.length && Math.max(...years) <= year - 3) add('media', `Copyright fermo al ${Math.max(...years)}: sito che appare abbandonato`, 'Aggiornare contenuti e footer; un sito curato trasmette affidabilità');

  const emails = [...new Set([...html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0].toLowerCase()))].filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !/(sentry|wixpress|example\.)/.test(e)).slice(0, 5);
  const phones = [...new Set([...html.matchAll(/href=["']tel:([+\d\s().-]{6,})["']/gi)].map((m) => m[1].replace(/[^\d+]/g, '')))].slice(0, 5);

  const hasCta = /href=["'](tel:|mailto:|https?:\/\/(wa\.me|api\.whatsapp\.com))/i.test(html);
  if (!hasCta) add('alta', 'Nessun contatto cliccabile (telefono, email, WhatsApp)', 'Aggiungere pulsanti "Chiama" e "Scrivi su WhatsApp" ben visibili');

  const hasMenuOrBooking = /(menu|menù|prenota|booking|reserv|thefork|booking\.com|listino|prezzi)/i.test(lower);
  if (!hasMenuOrBooking) add('media', 'Nessun menu, listino o sistema di prenotazione trovato', 'Inserire menu/servizi con prezzi e un modulo di prenotazione');

  const pick = (re: RegExp) => html.match(re)?.[0];
  const social = {
    instagram: pick(/https?:\/\/(?:www\.)?instagram\.com\/[a-z0-9._]+/i),
    facebook: pick(/https?:\/\/(?:www\.)?facebook\.com\/[a-z0-9._\-/]+/i),
    tiktok: pick(/https?:\/\/(?:www\.)?tiktok\.com\/@[a-z0-9._]+/i),
    linkedin: pick(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-z0-9._\-]+/i),
    youtube: pick(/https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[a-z0-9._\-]+/i),
  };
  if (!Object.values(social).some(Boolean)) add('bassa', 'Nessun collegamento ai social', 'Collegare Instagram/Facebook e mostrare un feed per dare vita al sito');

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((i) => !/\balt=["'][^"']+/i.test(i)).length;
  if (imgs.length >= 4 && noAlt / imgs.length > 0.5) add('bassa', 'Molte immagini senza testo alternativo', 'Aggiungere alt descrittivi: aiuta SEO e accessibilità');

  if (responseMs > 3000) add('media', `Server lento (${(responseMs / 1000).toFixed(1)} s per rispondere)`, 'Migliorare hosting e caching');

  const builder = /wp-content|wordpress/i.test(html) ? 'WordPress' : /wixstatic|wix\.com/i.test(html) ? 'Wix' : /squarespace/i.test(html) ? 'Squarespace' : /jimdo/i.test(html) ? 'Jimdo' : /shopify/i.test(html) ? 'Shopify' : /webflow/i.test(html) ? 'Webflow' : '';

  const score = finalizeScore(issues);
  return { url: finalUrl || url, reachable: true, score, issues, responseMs, title, emails, phones, social, builder, hasMenuOrBooking };
}

export function finalizeScore(issues: Issue[], pagespeedPerf?: number): number {
  let s = 10 - issues.reduce((a, i) => a + PEN[i.severity], 0);
  if (pagespeedPerf !== undefined) s -= pagespeedPerf < 0.5 ? 1.5 : pagespeedPerf < 0.8 ? 0.5 : 0;
  return Math.max(0, Math.min(10, Math.round(s * 2) / 2));
}

export function unreachable(url: string): SiteAudit {
  return {
    url, reachable: false, score: 0, responseMs: 0, title: '', emails: [], phones: [], social: {}, builder: '', hasMenuOrBooking: false,
    issues: [{ severity: 'alta', problem: 'Il sito non risponde o non è raggiungibile', proposal: 'Ripristinare il sito o crearne uno nuovo: oggi i clienti non riescono a trovarlo' }],
  };
}
