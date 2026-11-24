import type { Issue } from './analyze.js';
import type { Pagespeed } from './psi.js';

export interface LandingAudit {
  url: string;
  reachable: boolean;
  score: number; // 0-10
  issues: Issue[];
  forms: { count: number; maxFields: number };
  tracking: { metaPixel: boolean; gtm: boolean; ga: boolean };
  hasPhoneOrWhatsapp: boolean;
  outboundLinks: number;
  pagespeed?: Pagespeed;
  proposal: { section: string; content: string }[];
}

const PEN = { alta: 2, media: 1, bassa: 0.5 } as const;

export function scoreFrom(issues: Issue[], perf?: number): number {
  let s = 10 - issues.reduce((a, i) => a + PEN[i.severity], 0);
  if (perf !== undefined) s -= perf < 0.5 ? 1.5 : perf < 0.8 ? 0.5 : 0;
  return Math.max(0, Math.min(10, Math.round(s * 2) / 2));
}

export function analyzeLanding(url: string, html: string, finalUrl: string, ctx: { name: string; category: string }): LandingAudit {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], problem: string, proposal: string) => issues.push({ severity, problem, proposal });

  const tracking = {
    metaPixel: /fbq\(|connect\.facebook\.net\/[^"']*fbevents/i.test(html),
    gtm: /googletagmanager\.com\/gtm/i.test(html),
    ga: /gtag\(|google-analytics\.com|googletagmanager\.com\/gtag/i.test(html),
  };
  if (!tracking.metaPixel && !tracking.gtm) add('alta', 'Nessun Meta Pixel (né Tag Manager): le conversioni delle ads non vengono misurate', 'Installare il Pixel con evento Lead e l\'API Conversioni: senza dati Meta non ottimizza le campagne e il retargeting è impossibile');
  else if (!tracking.metaPixel) add('media', 'Meta Pixel non rilevato direttamente (potrebbe essere dentro Tag Manager)', 'Verificare con Meta Pixel Helper che parta l\'evento Lead alla conferma del modulo');

  const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/gi)].map((m) => m[0]);
  const fieldCount = (f: string) => (f.match(/<(input|select|textarea)\b[^>]*>/gi) ?? []).filter((i) => !/type=["']?(hidden|submit|button|checkbox|radio)/i.test(i)).length;
  const maxFields = forms.reduce((a, f) => Math.max(a, fieldCount(f)), 0);
  const hasPhoneOrWhatsapp = /href=["'](tel:|https?:\/\/(wa\.me|api\.whatsapp\.com))/i.test(html);

  if (!forms.length && !hasPhoneOrWhatsapp) add('alta', 'Nessun modulo né pulsante di chiamata/WhatsApp: il visitatore non ha modo di convertire', 'Aggiungere un modulo breve e un pulsante WhatsApp/Chiama sempre visibile');
  else if (!forms.length) add('media', 'Nessun modulo di contatto (solo telefono/WhatsApp): non si raccolgono lead tracciabili', 'Aggiungere un modulo a 3 campi e collegarlo al CRM');
  if (maxFields > 5) add('alta', `Modulo troppo lungo (${maxFields} campi): ogni campo in più riduce le conversioni`, 'Ridurre a nome, telefono ed eventuale messaggio (3 campi)');
  else if (maxFields === 5) add('media', 'Modulo con 5 campi', 'Ridurre a 3 campi e raccogliere il resto in seguito');
  if (forms.length && !/<input[^>]+type=["']checkbox["']/i.test(forms.join(' ')) && !/privacy/i.test(forms.join(' '))) add('media', 'Il modulo non ha consenso privacy esplicito', 'Aggiungere checkbox e link all\'informativa (obbligo GDPR sulla raccolta dati)');

  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) add('alta', 'Pagina non adattata al mobile (nessun viewport): la maggior parte del traffico ads è da smartphone', 'Rifare la pagina mobile-first');
  if (!finalUrl.startsWith('https://')) add('alta', 'Pagina senza HTTPS', 'Attivare SSL: Meta e i browser penalizzano le pagine non sicure');

  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  if (!h1s.length) add('alta', 'Nessun titolo principale (H1): non è chiaro cosa offri nei primi secondi', 'Titolo con beneficio concreto + destinatario (es. "Preventivo gratuito in 24h per …")');
  else if (h1s[0].length > 90) add('media', 'Titolo troppo lungo', 'Mantenerlo sotto le 10-12 parole');
  else if (h1s.length > 1) add('bassa', 'Più H1 nella stessa pagina', 'Usare un solo messaggio principale');

  const cta = /(richied|prenot|chiama|scopri|contatt|preventiv|iscriv|invia|scrivi|ottieni|scarica|prova)/i;
  const buttons = [...html.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/gi)].filter((m) => /btn|button|cta/i.test(m[0].slice(0, 200)) || m[1].toLowerCase() === 'button').map((m) => m[2].replace(/<[^>]+>/g, ''));
  if (!buttons.some((t) => cta.test(t)) && !forms.length) add('alta', 'Nessuna call-to-action chiara', 'Un solo obiettivo per pagina con pulsante ben visibile e verbo d\'azione');
  else if (buttons.some((t) => /^\s*(invia|submit|vai|clicca qui)\s*$/i.test(t))) add('bassa', 'Pulsante generico ("Invia"/"Clicca qui")', 'Usare un testo che promette il risultato: "Richiedi il preventivo gratuito"');

  const links = (html.match(/<a\b[^>]*href=/gi) ?? []).length;
  if (links > 25) add('media', `Troppi link (${links}): il visitatore può uscire dall'obiettivo`, 'Rimuovere menu e link superflui: una landing ha un solo scopo');

  if (!/(recension|testimonian|★|stelle|clienti soddisfatti|trustpilot|google reviews|dicono di noi|ha scelto)/i.test(html)) add('media', 'Nessuna prova sociale (recensioni, testimonianze, loghi)', 'Inserire recensioni Google reali e numeri (clienti, anni di attività)');
  if (!/(gratis|gratuit|sconto|offerta|-\s?\d+\s?%|senza impegno|solo per|entro il|ultimi)/i.test(html)) add('bassa', 'Nessuna offerta o motivo per agire ora', 'Aggiungere un incentivo chiaro (consulenza gratuita, sconto prima visita, posti limitati veri)');
  if (!/(privacy|cookie)/i.test(html)) add('media', 'Nessun link a privacy/cookie policy', 'Aggiungere footer con informativa: richiesto dalla legge e da Meta per le ads con raccolta dati');
  if (/<(img|picture|video)\b/i.test(html) === false) add('media', 'Nessuna immagine o video', 'Mostrare foto reali dell\'attività o un breve video: aumentano fiducia e tempo in pagina');
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) add('bassa', 'Pagina con noindex', 'Corretto per una landing a pagamento, ma verificare di non averlo messo per errore su pagine che devono posizionarsi');

  const proposal = buildProposal(ctx, issues, { forms: forms.length > 0, maxFields, h1: h1s[0] });
  return { url: finalUrl || url, reachable: true, score: scoreFrom(issues), issues, forms: { count: forms.length, maxFields }, tracking, hasPhoneOrWhatsapp, outboundLinks: links, proposal };
}

export function landingUnreachable(url: string, ctx: { name: string; category: string }): LandingAudit {
  const issues: Issue[] = [{ severity: 'alta', problem: 'La pagina di destinazione non risponde: ogni clic sull\'annuncio è denaro perso', proposal: 'Ripristinare subito la pagina o cambiare destinazione' }];
  return { url, reachable: false, score: 0, issues, forms: { count: 0, maxFields: 0 }, tracking: { metaPixel: false, gtm: false, ga: false }, hasPhoneOrWhatsapp: false, outboundLinks: 0, proposal: buildProposal(ctx, issues, { forms: false, maxFields: 0 }) };
}

/** Struttura della landing ottimizzata (bozza deterministica; la versione con testi completi arriverà dall'agente Operativo). */
function buildProposal(ctx: { name: string; category: string }, _issues: Issue[], f: { forms: boolean; maxFields: number; h1?: string }) {
  const n = ctx.name, c = ctx.category;
  return [
    { section: 'Hero (sopra la piega)', content: `Titolo con il beneficio principale per chi cerca ${c} in zona${f.h1 ? ` (oggi: "${f.h1.slice(0, 80)}")` : ''}, sottotitolo di una riga e un solo pulsante: "Richiedi ora, è gratis". Foto reale di ${n}.` },
    { section: 'Prova sociale', content: 'Stelle e numero di recensioni Google, 2-3 testimonianze con nome e foto, anni di attività.' },
    { section: 'Cosa ottieni', content: '3 benefici in elenco breve (non caratteristiche tecniche), ciascuno con icona.' },
    { section: 'Offerta', content: 'Incentivo chiaro e limitato nel tempo o nei posti, senza impegno.' },
    { section: 'Modulo', content: `${f.maxFields > 3 || !f.forms ? 'Modulo a 3 campi' : 'Mantenere il modulo breve'}: nome, telefono, messaggio. Checkbox privacy. Pulsante con testo orientato al risultato. In alternativa pulsante WhatsApp con testo precompilato.` },
    { section: 'Dubbi frequenti', content: '4-5 domande (costi, tempi, come funziona, garanzie).' },
    { section: 'Chiusura', content: 'Ripetere pulsante e contatti; footer con privacy, P.IVA e indirizzo. Nessun menu di navigazione.' },
    { section: 'Misurazione', content: 'Meta Pixel + API Conversioni con evento Lead, pagina di ringraziamento dedicata, UTM sulle ads.' },
  ];
}
