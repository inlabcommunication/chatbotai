# Lead Finder

Trova attività locali, le analizza (sito, social, ads, landing), dà un punteggio di opportunità e ti guida dal primo messaggio WhatsApp alla call.

## Schede dell'app
- **Oggi**: cosa fare adesso (ricontatti, call, migliori opportunità).
- **Trova**: tipo di attività + regione/provincia/comune → riempie il database (OpenStreetMap, gratis).
- **Lead**: database filtrabile per regione/provincia/comune/categoria/stato; azioni in blocco (analizza, da contattare, chiedi allo Stratega); scheda con analisi sito, social, ads, landing, messaggio, invio, CRM, report dopo la call, bozza di sito, report PDF.
- **Coda**: un messaggio WhatsApp alla volta, un clic per inviare (l'invio resta manuale), email per chi non ha cellulare.
- **Pipeline**: stati da "Da contattare" a "Cliente", con ricontatti e call.
- **Strategia**: chat con un assistente che conosce tutto il database (serve l'AI collegata).
- **Collegamenti**: stato e istruzioni di ogni collegamento.

## Funziona subito, senza collegamenti
Ricerca, analisi sito/landing, punteggi, CRM, messaggi-bozza, coda WhatsApp, report PDF, bozza di sito. I dati stanno nel browser finché non colleghi Firebase.

## Collegamenti (vedi scheda "Collegamenti" nell'app)
| Variabile | Serve per |
|---|---|
| `LEAD_FINDER_TOKEN` | proteggere le API (obbligatoria per l'AI) |
| `VITE_FIREBASE_*` + `firestore.rules` | dati condivisi tra dispositivi |
| `ANTHROPIC_API_KEY` | Stratega, messaggi AI, report post-call |
| `META_AD_LIBRARY_TOKEN` | controllo automatico delle ads attive |
| `PAGESPEED_API_KEY` | quota maggiore per le analisi in blocco |

## Sviluppo
```
npm install
npm run dev       # interfaccia
npx vercel dev    # interfaccia + API
```
Deploy su Vercel con *Root Directory* = `lead-finder`.

## Note
- Contatto solo B2B, l'opt-out è nel testo. L'app non invia nulla da sola.
- Instagram/Facebook: si leggono solo i dati pubblici da fuori; se la rete blocca, l'app apre il profilo a mano.
- Dati ads/OSM/social non verificati dal sandbox di sviluppo (rete bloccata): verificare dopo il deploy.
