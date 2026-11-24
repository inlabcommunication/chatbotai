# Lead Finder

Trova attività locali, ne analizza il sito (voto 0-10 con problemi e proposte), calcola un punteggio di opportunità e gestisce il contatto (CRM + link WhatsApp precompilati).

## Avvio
```
npm install
npm run dev        # solo interfaccia (le API /api/* richiedono Vercel)
npx vercel dev     # interfaccia + API
```
Deploy su Vercel: *Root Directory* = `lead-finder`. Variabili facoltative in `.env.example`.

## Cosa c'è (fase 1)
- `api/search.ts` — ricerca per categoria + comune da OpenStreetMap/Overpass (gratis).
- `api/audit.ts` — scarica il sito e lo valuta (HTTPS, mobile, SEO base, tecnologia datata, contatti, social…) + PageSpeed Insights.
- `src/` — lista lead ordinata per opportunità, scheda con analisi, messaggio WhatsApp (`wa.me`), stati CRM, ricontatto, call, note. Dati salvati nel browser (localStorage).

## Prossimi passi
Database condiviso (Firestore), audit social e Ads Library, chat Stratega, agente Operativo (PDF, report post-call), bozza sito.

## Note
- WhatsApp: l'invio resta manuale (un clic sul link); si usa solo per cellulari italiani (3xx).
- Nel messaggio è già presente l'opt-out. Contatta solo attività (B2B) e rispetta le richieste di non essere ricontattati.
