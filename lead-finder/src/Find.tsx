import { useState } from 'react';
import { REGIONS } from './regions';
import { call } from './api';
import type { Lead } from './model';

export const CATEGORIES: [string, string][] = [
  ['ristorante', '🍝 Ristoranti'], ['pizzeria', '🍕 Pizzerie'], ['bar', '☕ Bar'], ['bnb', '🛏 B&B'], ['hotel', '🏨 Hotel'], ['agriturismo', '🌾 Agriturismi'],
  ['parrucchiere', '💇 Parrucchieri'], ['dentista', '🦷 Dentisti'], ['palestra', '🏋️ Palestre'], ['abbigliamento', '👗 Abbigliamento'], ['officina', '🔧 Officine'],
];

type Props = { onAdd: (l: Lead[]) => number; onDone: (n: number) => void };
export default function Find({ onAdd, onDone }: Props) {
  const [category, setCategory] = useState('ristorante');
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [comune, setComune] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ready = !!(region || province || comune);

  async function search() {
    setBusy(true); setMsg(null);
    try {
      const qs = new URLSearchParams({ category, region, province, comune: comune.trim() });
      const d = await call<{ count: number; leads: Lead[] }>(`/api/search?${qs}`);
      const place = [comune.trim(), province, region].filter(Boolean).join(', ');
      const added = onAdd(d.leads.map((l) => ({ ...l, region, province, comune: comune.trim() || l.city, place, status: 'nuovo', notes: '', createdAt: new Date().toISOString() })));
      setMsg(d.count === 0
        ? { ok: false, text: 'Nessun risultato in OpenStreetMap per questa zona. Prova un\'area più grande (solo provincia) o un\'altra categoria: la mappa non contiene tutte le attività.' }
        : { ok: true, text: `Trovate ${d.count} attività, ${added} nuove aggiunte al database.` });
      if (added) onDone(added);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <div className="card wide">
      <h2>Cerca attività da contattare</h2>
      <h3>1. Che tipo di attività?</h3>
      <div className="chips">{CATEGORIES.map(([k, label]) => <button key={k} className={'chip' + (k === category ? ' on' : '')} onClick={() => setCategory(k)}>{label}</button>)}</div>
      <h3>2. Dove?</h3>
      <div className="row">
        <select value={region} onChange={(e) => { setRegion(e.target.value); setProvince(''); }}><option value="">Regione…</option>{Object.keys(REGIONS).map((r) => <option key={r}>{r}</option>)}</select>
        <select value={province} disabled={!region} onChange={(e) => setProvince(e.target.value)}><option value="">Tutta la regione</option>{(REGIONS[region] ?? []).map((p) => <option key={p}>{p}</option>)}</select>
        <input placeholder="Comune (facoltativo)" value={comune} onChange={(e) => setComune(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ready && search()} />
      </div>
      <p className="muted">Più la zona è piccola, più la ricerca è veloce. Consiglio: parti da una provincia o da un comune.</p>
      <button className="pri big" disabled={busy || !ready} onClick={search}>{busy ? 'Sto cercando… (può richiedere 20-30 secondi)' : 'Cerca'}</button>
      {msg && <p className={msg.ok ? 'ok' : 'alta'}>{msg.text}</p>}
    </div>
  );
}
