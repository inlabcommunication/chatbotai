import { useEffect, useState } from 'react';
import type React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from './firebase';
import { AgentChat } from './AgentChat';

// Pagina /chat: la chat degli agenti come app a sé (installabile sul telefono con
// "Aggiungi alla schermata Home"), separata dal sito e dalla dashboard.

/** Imposta manifest, colori e meta dell'app solo mentre si è su /chat. */
function useAppShell() {
  useEffect(() => {
    const added: HTMLElement[] = [];
    const add = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el); added.push(el);
    };
    const old = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const oldHref = old?.getAttribute('href');
    old?.setAttribute('href', '/manifest.webmanifest');
    if (!old) add('link', { rel: 'manifest', href: '/manifest.webmanifest' });
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const oldTheme = theme?.content;
    if (theme) theme.content = '#202c33';
    const vp = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const oldVp = vp?.content;
    if (vp) vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Chat InLab' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    add('meta', { name: 'robots', content: 'noindex, nofollow' });
    const prevTitle = document.title; document.title = 'Chat InLab';
    document.body.style.background = '#0b141a';
    return () => {
      added.forEach(e => e.remove());
      if (old && oldHref) old.setAttribute('href', oldHref);
      if (theme && oldTheme) theme.content = oldTheme;
      if (vp && oldVp) vp.content = oldVp;
      document.title = prevTitle; document.body.style.background = '';
    };
  }, []);
}

const box: React.CSSProperties = { minHeight: '100dvh', background: '#0b141a', color: '#e9edef', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "system-ui, sans-serif" };
const input: React.CSSProperties = { width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', background: '#2a3942', color: '#e9edef', fontSize: 16, outline: 'none' };
const button: React.CSSProperties = { width: '100%', padding: 14, borderRadius: 100, border: 'none', background: '#00a884', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' };

export const ChatApp = () => {
  useAppShell();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');

  useEffect(() => {
    if (!auth) { setChecking(false); return; }
    return onAuthStateChanged(auth, async u => {
      setUser(u);
      let ok = false;
      setWhy('');
      if (u && db) {
        try {
          ok = (await getDoc(doc(db, 'admins', u.uid))).exists();
          if (!ok) setWhy('Il documento admins/' + u.uid + ' non esiste in Firestore (progetto ' + db.app.options.projectId + ').');
        } catch (e: any) { ok = false; setWhy('Errore Firestore: ' + (e?.code || e?.message || e)); }
      }
      setIsAdmin(ok); setChecking(false);
    });
  }, []);

  if (!isFirebaseConfigured()) return <div style={box}>Chat non configurata.</div>;
  if (checking) return <div style={box}>Caricamento…</div>;
  if (user && isAdmin) return <AgentChat onLogout={() => auth && signOut(auth)} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setBusy(true);
    try { await signInWithEmailAndPassword(auth!, email, password); } catch { setError('Email o password errati.'); }
    setBusy(false);
  };

  return (
    <div style={box}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 26, color: '#0b141a', alignSelf: 'center' }}>IL</div>
        <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 600 }}>Chat InLab</h1>
        {user && !isAdmin
          ? <p style={{ color: '#ffb4b4', textAlign: 'center', fontSize: 14, overflowWrap: 'anywhere' }}>{user.email} non è autorizzato.<br /><span style={{ color: '#8696a0', fontSize: 12 }}>{why}</span></p>
          : <p style={{ color: '#8696a0', textAlign: 'center', fontSize: 14 }}>Accedi con le credenziali della dashboard.</p>}
        {user && !isAdmin
          ? <button type="button" style={button} onClick={() => auth && signOut(auth)}>Esci</button>
          : <>
              <input style={input} type="email" placeholder="Email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
              <input style={input} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              {error && <div style={{ color: '#ffb4b4', fontSize: 13, textAlign: 'center' }}>{error}</div>}
              <button style={{ ...button, opacity: busy ? .6 : 1 }} disabled={busy}>{busy ? 'Accesso…' : 'Entra'}</button>
            </>}
      </form>
    </div>
  );
};
