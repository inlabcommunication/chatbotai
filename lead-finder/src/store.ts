import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { cloud, cloudConfigured } from './cloud';
import type { Lead } from './model';

const KEY = 'lead-finder:leads:v2';
const load = (): Lead[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };

/** Dati salvati nel browser; se Firebase è configurato e hai fatto il login, sincronizzati su tutti i dispositivi. */
export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>(load);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [syncError, setSyncError] = useState('');
  const ref = useRef(leads); ref.current = leads;
  const synced = useRef(false);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(leads)); } catch { /* quota */ } }, [leads]);
  useEffect(() => cloud.onUser((u) => { setUser(u); setAuthReady(true); synced.current = false; }), []);
  useEffect(() => {
    if (!user) return;
    return cloud.watch((remote) => {
      if (!synced.current) { // primo allineamento: carica su Firebase i lead locali che mancano
        synced.current = true;
        const ids = new Set(remote.map((r) => r.id));
        ref.current.filter((l) => !ids.has(l.id)).forEach((l) => cloud.save(l).catch((e) => setSyncError(String(e))));
        setLeads([...remote, ...ref.current.filter((l) => !ids.has(l.id))]);
      } else setLeads(remote);
      setSyncError('');
    }, (e) => setSyncError(e.message));
  }, [user]);

  const upsertMany = useCallback((incoming: Lead[]) => {
    const have = new Set(ref.current.map((l) => l.id));
    const fresh = incoming.filter((l) => !have.has(l.id));
    if (!fresh.length) return 0;
    setLeads((cur) => [...cur, ...fresh]);
    if (user) fresh.forEach((l) => cloud.save(l).catch((e) => setSyncError(String(e))));
    return fresh.length;
  }, [user]);
  const patch = useCallback((id: string, p: Partial<Lead>) => {
    const upd = { ...p, updatedAt: new Date().toISOString() };
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...upd } : l)));
    const merged = ref.current.find((l) => l.id === id);
    if (user && merged) cloud.save({ ...merged, ...upd }).catch((e) => setSyncError(String(e)));
  }, [user]);
  const patchMany = useCallback((ids: string[], p: Partial<Lead>) => ids.forEach((id) => patch(id, p)), [patch]);
  const remove = useCallback((id: string) => { setLeads((cur) => cur.filter((l) => l.id !== id)); if (user) cloud.remove(id).catch((e) => setSyncError(String(e))); }, [user]);
  return { leads, upsertMany, patch, patchMany, remove, user, authReady, syncError };
}
