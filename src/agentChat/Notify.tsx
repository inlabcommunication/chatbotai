import { useEffect, useState } from 'react';
import type React from 'react';
import { Bell, BellOff } from 'lucide-react';
import { auth } from '../firebase';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function api(method: string, body?: unknown): Promise<any> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Sessione scaduta: esci e rientra.');
  const r = await fetch('/api/push', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Errore ${r.status}`), { data: j });
  return j;
}

const keyBytes = (b64: string) => {
  const raw = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

/** Pulsante campanella: attiva o disattiva le notifiche push su questo dispositivo. */
export const NotifyButton = ({ onMessage }: { onMessage: (m: string | null) => void }) => {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);

  useEffect(() => {
    if (!supported()) return;
    navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setOn(!!sub && Notification.permission === 'granted'))
      .catch(() => { /* senza service worker niente notifiche: il pulsante lo spiegherà */ });
  }, []);

  const toggle = async () => {
    if (!supported()) {
      onMessage('Questo browser non supporta le notifiche. Su iPhone: aggiungi l\'app alla schermata Home (serve iOS 16.4 o successivo) e aprila da lì.');
      return;
    }
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (on && existing) {
        await api('DELETE', { endpoint: existing.endpoint });
        await existing.unsubscribe();
        setOn(false); onMessage('Notifiche disattivate su questo dispositivo.');
      } else {
        if (Notification.permission === 'denied') { onMessage('Le notifiche sono bloccate: riattivale nelle impostazioni del browser o dell\'app per questo sito.'); setBusy(false); return; }
        if ((await Notification.requestPermission()) !== 'granted') { onMessage('Permesso per le notifiche non concesso.'); setBusy(false); return; }
        const { publicKey } = await api('GET');
        const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        await api('POST', { subscription: sub.toJSON() });
        setOn(true);
        await api('POST', { action: 'test' }).catch(() => {});
        onMessage(null);
      }
    } catch (e: any) {
      if (e?.data?.generated) { setKeys(e.data.generated); onMessage(null); }
      else onMessage(`Notifiche non attivate: ${e?.message || 'errore'}`);
    }
    setBusy(false);
  };

  return (<>
    {keys && <KeysPanel keys={keys} onClose={() => setKeys(null)} />}
    <button className="wa-exit" onClick={toggle} disabled={busy} title={on ? 'Notifiche attive: tocca per disattivare' : 'Attiva le notifiche'} aria-label={on ? 'Disattiva le notifiche' : 'Attiva le notifiche'}>
      {on ? <Bell size={14} /> : <BellOff size={14} />}
    </button>
  </>);
};

const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 };
const code: React.CSSProperties = { flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, background: '#2a3942', fontSize: 12, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace' };
const copyBtn: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, background: '#00a884', color: '#fff', fontSize: 13, whiteSpace: 'nowrap' };

/** Chiavi appena generate, da copiare su Vercel (una sola volta; non vengono salvate). */
const KeysPanel = ({ keys, onClose }: { keys: { publicKey: string; privateKey: string }; onClose: () => void }) => {
  const [done, setDone] = useState('');
  const copy = async (name: string, v: string) => { try { await navigator.clipboard.writeText(v); setDone(name); } catch { setDone(''); } };
  const items: [string, string, string][] = [
    ['VAPID_PUBLIC_KEY', keys.publicKey, 'chiave pubblica'],
    ['VAPID_PRIVATE_KEY', keys.privateKey, 'chiave privata (segreta)'],
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#111b21', color: '#e9edef', borderRadius: 14, padding: 18, maxWidth: 520, width: '100%', maxHeight: '90dvh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Attiva le notifiche: 3 variabili su Vercel</h3>
        <p style={{ fontSize: 13, color: '#8696a0', lineHeight: 1.5, margin: '0 0 12px' }}>
          Su Vercel → Settings → Environment Variables crea queste tre variabili (nome esatto, valore senza virgolette), poi Redeploy.
          Queste chiavi sono nuove e non vengono salvate: copiale ora. Non scriverle in chat né nel repository.
        </p>
        {items.map(([name, value, label]) => (
          <div key={name}>
            <div style={{ fontSize: 12, color: '#8696a0', marginBottom: 4 }}>{name} · {label}</div>
            <div style={row}><div style={code}>{value}</div><button style={copyBtn} onClick={() => copy(name, value)}>{done === name ? 'Copiata ✓' : 'Copia'}</button></div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: '#8696a0', marginBottom: 4 }}>VAPID_SUBJECT · il tuo indirizzo email preceduto da mailto:</div>
        <div style={row}><div style={code}>mailto:la-tua-email@esempio.it</div></div>
        <p style={{ fontSize: 13, color: '#8696a0', lineHeight: 1.5, margin: '4px 0 12px' }}>
          Dopo il Redeploy ricarica l'app e tocca di nuovo la campanella: consenti le notifiche e arriva la notifica di prova.
        </p>
        <button style={{ ...copyBtn, background: '#2a3942' }} onClick={onClose}>Chiudi</button>
      </div>
    </div>
  );
};
