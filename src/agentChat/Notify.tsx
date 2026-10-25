import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { auth } from '../firebase';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function api(method: string, body?: unknown): Promise<any> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Sessione scaduta: esci e rientra.');
  const r = await fetch('/api/push', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
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
      onMessage(`Notifiche non attivate: ${e?.message || 'errore'}`);
    }
    setBusy(false);
  };

  return (
    <button className="wa-exit" onClick={toggle} disabled={busy} title={on ? 'Notifiche attive: tocca per disattivare' : 'Attiva le notifiche'} aria-label={on ? 'Disattiva le notifiche' : 'Attiva le notifiche'}>
      {on ? <Bell size={14} /> : <BellOff size={14} />}
    </button>
  );
};
