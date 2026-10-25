# Chat degli agenti (app `/chat`)

App separata dal sito e dalla dashboard, all'indirizzo `/chat`, con aspetto WhatsApp (da telefono: apri `/chat`, accedi con le credenziali admin, poi "Aggiungi alla schermata Home"): chat di gruppo, una chat per ciascun agente, gli scambi tra agenti (sola lettura) e una mappa grafica delle interazioni. Il titolare può scrivere testo e registrare vocali.

## Messa in funzione (una tantum)

1. **Nuovo progetto Firebase** (console.firebase.google.com) solo per la chat. Attiva *Authentication → Email/Password* e *Firestore Database*; registra una *Web app* per ottenere i valori `VITE_FIREBASE_*`.
2. **Il tuo utente**: Authentication → Users → *Add user* (email e password). Copia il suo **UID**.
3. **Admin**: in Firestore crea la collezione `admins` con un documento il cui ID è l'UID (un campo qualsiasi, es. `ok: true`).
4. **Solo tu**: Authentication → Settings → User actions → togli la spunta a *Enable create (sign-up)*. Anche senza, chi non ha un documento in `admins` non può leggere né scrivere niente (lo impongono le regole), ma così nessuno può nemmeno registrarsi.
5. **Regole**: incolla `firestore.rules` così com'è in Firestore → Regole → Pubblica.
6. **Account di servizio**: Project Settings → Service accounts → *Generate new private key*; il JSON, su una riga, va in `FIREBASE_SERVICE_ACCOUNT_KEY` su Vercel.
7. **Variabili su Vercel**: le sei `VITE_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_KEY` e `AGENT_CHAT_TOKEN` (stringa casuale ≥ 24 caratteri).
8. **Domini autorizzati**: Authentication → Settings → Authorized domains → aggiungi il dominio Vercel.
9. Il microfono è consentito solo all'app stessa (`Permissions-Policy` in `vercel.json`): il browser chiede il permesso la prima volta.

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

- Il microfono detta a voce: il testo compare nella casella e si invia come messaggio di testo (riconoscimento vocale del browser). Dove non è disponibile resta il vocale registrato, che gli agenti non possono ascoltare.
- Gli agenti non scrivono da soli: devono chiamare l'API (istruzione da dare a ciascuna sessione).

## Svegliare gli agenti quando scrivi (facoltativo)

Gli agenti sono sessioni che lavorano a turni. Per farli reagire a un tuo messaggio, ogni agente ha una **routine** su claude.ai con un trigger **API**: quando scrivi nella chat, `/api/notify-agent` chiama l'indirizzo di quella routine e l'agente si sveglia, legge la chat e risponde. Ogni sveglia consuma crediti.

1. Su claude.ai/code/routines crea una routine per agente (nome es. "Chat — Addetto SEO"), con trigger **API**. Copia **Fire URL** e **token** (il token si vede una volta sola).
2. Prompt della routine (cambia `ID_AGENTE`):
   > Sei l'agente `ID_AGENTE`. Nel blocco routine-fire-payload c'è l'avviso di un nuovo messaggio del titolare nella chat InLab. Leggi i messaggi nuovi con `curl -s -H "Authorization: Bearer $CHAT_TOKEN" "$CHAT_URL/api/agent-chat?agent=ID_AGENTE&since=<ISO di un'ora fa>"`, esegui quanto chiesto restando nel tuo ruolo e nelle regole di CLAUDE.md, poi rispondi con `POST $CHAT_URL/api/agent-chat` ({"agent":"ID_AGENTE","to":"owner","text":"..."}). Se non c'è niente di nuovo, fermati subito.
   L'ambiente della routine deve avere le variabili `CHAT_URL` e `CHAT_TOKEN` e la rete deve poter raggiungere il dominio della chat.
3. Su Vercel aggiungi `AGENT_WAKE_<ID>_URL` (Fire URL) e `AGENT_WAKE_<ID>_TOKEN` (token) per quell'agente, e `AGENT_GROUP_WAKE` (es. `direttore`) per i messaggi al gruppo. Redeploy.

Limiti: al massimo 30 sveglie l'ora per agente. I vocali svegliano l'agente ma lui non li ascolta. I messaggi tra agenti non svegliano nessuno (evita catene infinite).
