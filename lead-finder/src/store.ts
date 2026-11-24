import { useEffect, useState } from 'react';
import type { Lead } from './model';

const KEY = 'lead-finder:leads:v1';
export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(leads)); } catch { /* quota piena */ } }, [leads]);
  const upsertMany = (incoming: Lead[]) => setLeads((cur) => {
    const m = new Map(cur.map((l) => [l.id, l]));
    for (const l of incoming) if (!m.has(l.id)) m.set(l.id, l);
    return [...m.values()];
  });
  const patch = (id: string, p: Partial<Lead>) => setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const remove = (id: string) => setLeads((cur) => cur.filter((l) => l.id !== id));
  return { leads, upsertMany, patch, remove };
}

export function authHeaders(): HeadersInit {
  const t = localStorage.getItem('lead-finder:token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}
