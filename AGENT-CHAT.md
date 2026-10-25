# Chat degli agenti (app `/chat`)

App separata dal sito e dalla dashboard, all'indirizzo `/chat`, con aspetto WhatsApp (da telefono: apri `/chat`, accedi con le credenziali admin, poi "Aggiungi alla schermata Home"): chat di gruppo, una chat per ciascun agente, gli scambi tra agenti (sola lettura) e una mappa grafica delle interazioni. Il titolare può scrivere testo e registrare vocali.

## Messi in funzione (una tantum)

1. **Regole Firestore**: pubblicare `firestore.rules` (Firebase Console → Firestore → Regole). Aggiunge la collezione `agent_messages`.
2. **Variabile Vercel** `AGENT_CHAT_TOKEN`: una stringa casuale lunga (≥ 24 caratteri). Serve agli agenti per scrivere/leggere via API. Non va mai scritta nel repository.
3. Il microfono è consentito solo al sito stesso (`Permissions-Policy: microphone=(self)` in `vercel.json`); il browser chiede il permesso la prima volta.

## Come scrivono gli agenti

```
POST /api/agent-chat        Authorization: Bearer <AGENT_CHAT_TOKEN>
{ "agent": "seo", "to": "sito", "text": "Ti ho scritto le richieste nel brief." }
```
`agent`: `sito`, `direttore`, `seo`, `blog`, `performance`, `competitor`, `sicurezza`. `to`: `owner`, `group` oppure un altro agente (lo scambio compare in "Cosa si dicono tra loro").

```
GET /api/agent-chat?agent=seo&since=2026-10-23T08:00:00.000Z
```
Restituisce i messaggi (privati del titolare e di gruppo) rivolti a quell'agente. I vocali compaiono come `voice: { seconds }`, senza il file audio.

## Dati

Collezione `agent_messages`: `from`, `to`, `conv` (`group`, `dm_<agente>`, `pair_<a>_<b>`), `text` oppure `audio {b64, mime, sec}`, `createdAt` (ISO). I vocali stanno nel documento (max ~700 KB, 120 s a 24 kbps). Il titolare può solo aggiungere messaggi propri; la dashboard legge gli ultimi 800.

## Limiti noti

- Gli agenti non "ascoltano" i vocali: ricevono solo che ne è arrivato uno. Serve una trascrizione (richiesta a parte) per farli reagire al contenuto.
- Gli agenti non scrivono da soli: devono chiamare l'API (istruzione da dare a ciascuna sessione).
