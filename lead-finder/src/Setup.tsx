import { useEffect, useState } from 'react';
import { call } from './api';
import { cloud, cloudConfigured } from './cloud';
import type { User } from 'firebase/auth';

export interface Status { tokenRequired: boolean; authorized: boolean; ai: boolean; adsLibrary: boolean; pagespeedKey: boolean }

function Card({ ok, title, why, children }: { ok: boolean; title: string; why: string; children: React.ReactNode }) {
  return <details className="card step" open={!ok}><summary>{ok ? '✅' : '⚪'} <b>{title}</b> <span className="muted">— {why}</span></summary>{children}</details>;
}

export default function Setup({ status, reload, user, syncError }: { status: Status | null; reload: () => void; user: User | null; syncError: string }) {
  const [token, setToken] = useState(() => { try { return localStorage.getItem('lead-finder:token') ?? ''; } catch { return ''; } });
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { reload(); }, []); // eslint-disable-line
  return (
    <div className="stack">
      <div className="card"><h2>Collegamenti</h2><p className="muted">L'app funziona già da sola (ricerca, analisi, CRM, messaggi). Questi collegamenti aggiungono sincronizzazione, AI e controllo delle ads. Ognuno è indipendente: attivali quando vuoi.</p>
        {!status && <p className="muted">Controllo lo stato… (le funzioni server si attivano dopo il deploy su Vercel)</p>}</div>

      <Card ok={!!status && (!status.tokenRequired || status.authorized)} title="Password di accesso alle API" why="protegge i servizi e il tuo credito AI">
        <ol><li>Su Vercel → Settings → Environment Variables aggiungi <code>LEAD_FINDER_TOKEN</code> con una stringa casuale lunga (almeno 24 caratteri).</li><li>Rifai il deploy e incolla la stessa stringa qui sotto.</li></ol>
        <div className="row"><input type="password" style={{ flex: 1 }} placeholder="Incolla la password" value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="pri" onClick={() => { try { localStorage.setItem('lead-finder:token', token.trim()); } catch { /* */ } reload(); }}>Salva</button></div>
        {status?.tokenRequired && !status.authorized && <p className="alta">La password non corrisponde.</p>}
      </Card>

      <Card ok={!!user} title="Salvataggio e sincronizzazione (Firebase)" why="stessi dati su telefono e PC, niente perdite">
        {!cloudConfigured ? <ol><li>Su console.firebase.google.com crea un progetto, attiva <b>Authentication → Email/Password</b> e <b>Firestore</b>.</li><li>Registra una Web app e copia i valori in Vercel: <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code>, <code>VITE_FIREBASE_APP_ID</code>.</li><li>Crea il tuo utente (Authentication → Users) e in Firestore la collezione <code>admins</code> con un documento il cui ID è il suo UID.</li><li>Incolla <code>firestore.rules</code> (cartella lead-finder) in Firestore → Regole.</li></ol>
          : user ? <><p className="ok">Collegato come {user.email}. I tuoi lead sono sincronizzati.</p><button className="sec" onClick={() => cloud.logout()}>Esci</button>{syncError && <p className="alta">{syncError}</p>}</>
            : <div className="row"><input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button className="pri" onClick={() => cloud.login(email, pw).catch((e) => setErr(e.message))}>Accedi</button>{err && <span className="alta">{err}</span>}</div>}
        <p className="muted">Finché non è collegato, i dati restano solo in questo browser: non cancellare i dati del sito.</p>
      </Card>

      <Card ok={!!status?.ai} title="Intelligenza artificiale (Stratega e messaggi AI)" why="chat strategica, messaggi su misura, report dopo la call">
        <ol><li>Crea una chiave su console.anthropic.com → API Keys (a consumo: pochi centesimi per richiesta).</li><li>In Vercel aggiungi <code>ANTHROPIC_API_KEY</code>. Serve anche <code>LEAD_FINDER_TOKEN</code> (sopra).</li></ol>
      </Card>

      <Card ok={!!status?.adsLibrary} title="Controllo automatico delle ads (Meta Ad Library)" why="senza, usi il link e spunti a mano">
        <ol><li>Su developers.facebook.com crea un'app e verifica la tua identità (serve per l'accesso alla Ad Library).</li><li>Genera un token di accesso e mettilo in Vercel come <code>META_AD_LIBRARY_TOKEN</code>.</li></ol>
      </Card>

      <Card ok={!!status?.pagespeedKey} title="Chiave PageSpeed (facoltativa)" why="evita i limiti di quota nelle analisi in blocco">
        <p>In Google Cloud abilita "PageSpeed Insights API", crea una chiave e salvala come <code>PAGESPEED_API_KEY</code>.</p>
      </Card>
    </div>
  );
}

export const loadStatus = () => call<Status>('/api/status');
