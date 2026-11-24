import { type Lead, mobileWhatsApp } from './model';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const THEMES: Record<string, [string, string, string]> = {
  ristorante: ['#7c2d12', '#fff7ed', 'Cucina, accoglienza e tradizione'], pizzeria: ['#b91c1c', '#fef2f2', 'Pizza fatta come si deve'], bar: ['#78350f', '#fffbeb', 'Il tuo momento di pausa'],
  bnb: ['#0f766e', '#f0fdfa', 'Il posto giusto dove fermarsi'], hotel: ['#1e3a8a', '#eff6ff', 'Ospitalità curata in ogni dettaglio'], agriturismo: ['#3f6212', '#f7fee7', 'Natura, sapori e relax'],
  parrucchiere: ['#9d174d', '#fdf2f8', 'Stile e cura per i tuoi capelli'], dentista: ['#0369a1', '#f0f9ff', 'Il tuo sorriso in buone mani'], palestra: ['#111827', '#f3f4f6', 'Allenati con i risultati in mente'],
  abbigliamento: ['#4c1d95', '#f5f3ff', 'Il tuo stile, ogni giorno'], officina: ['#334155', '#f1f5f9', 'Cura e competenza per la tua auto'],
};

/** Bozza di sito in un unico file HTML (tutto il testo del lead è escapato). */
export function buildSiteHtml(l: Lead): string {
  const [color, tint, tagline] = THEMES[l.category] ?? ['#1f2937', '#f9fafb', 'Qualità e professionalità'];
  const wa = mobileWhatsApp(l);
  const addr = [l.address, l.postcode, l.comune || l.city].filter(Boolean).join(', ');
  const map = l.lat != null && l.lon != null ? `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=17/${l.lat}/${l.lon}` : '';
  const tel = l.phone.replace(/[^\d+]/g, '');
  const cta = [
    wa ? `<a class="btn" href="https://wa.me/${wa}">Scrivici su WhatsApp</a>` : '',
    tel ? `<a class="btn ghost" href="tel:${esc(tel)}">Chiama ora</a>` : '',
  ].join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(l.name)} — ${esc(l.comune || l.city || '')}</title><meta name="description" content="${esc(l.name)}: ${esc(tagline)}${l.comune ? ' a ' + esc(l.comune) : ''}.">
<style>*{box-sizing:border-box}body{margin:0;font:17px/1.6 system-ui,sans-serif;color:#1f2937}
header{background:${color};color:#fff;padding:72px 20px;text-align:center}h1{margin:0 0 8px;font-size:clamp(30px,6vw,52px)}header p{margin:0 auto 24px;max-width:560px;opacity:.9;font-size:20px}
.btn{display:inline-block;background:#fff;color:${color};padding:14px 24px;border-radius:999px;font-weight:700;text-decoration:none;margin:4px}.btn.ghost{background:transparent;color:#fff;border:2px solid #fff}
section{max-width:860px;margin:0 auto;padding:44px 20px}.box{background:${tint};border-radius:16px;padding:24px}h2{color:${color};margin-top:0}footer{text-align:center;color:#6b7280;font-size:14px;padding:24px}</style></head><body>
<header><h1>${esc(l.name)}</h1><p>${esc(tagline)}${l.comune ? ' · ' + esc(l.comune) : ''}</p>${cta}</header>
<section><div class="box"><h2>Dove siamo</h2><p>${esc(addr) || 'Indirizzo da completare'}</p>${l.openingHours ? `<p><b>Orari:</b> ${esc(l.openingHours)}</p>` : ''}${map ? `<p><a href="${map}">Apri la mappa</a></p>` : ''}</div></section>
<section><h2>Chi siamo</h2><p>[Testo da personalizzare con la storia di ${esc(l.name)}, i punti di forza e cosa ti rende diverso dagli altri.]</p></section>
<section><div class="box"><h2>Contatti</h2>${l.phone ? `<p>Telefono: <a href="tel:${esc(tel)}">${esc(l.phone)}</a></p>` : ''}${l.email ? `<p>Email: <a href="mailto:${esc(l.email)}">${esc(l.email)}</a></p>` : ''}${cta}</div></section>
<footer>Bozza di proposta creata da InLab — non pubblicata</footer></body></html>`;
}
