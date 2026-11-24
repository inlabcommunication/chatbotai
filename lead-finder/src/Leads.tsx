import { useMemo, useState } from 'react';
import { type Lead, type Status, STATUSES, STATUS_LABEL, opportunity, mobileWhatsApp } from './model';
import { CATEGORIES } from './Find';
import { Score, Empty } from './ui';

type Props = {
  leads: Lead[]; selId: string | null; setSelId: (id: string | null) => void;
  checked: Set<string>; setChecked: (s: Set<string>) => void;
  onBatchAnalyze: (ids: string[]) => void; onMark: (ids: string[], s: Status) => void; onStrategy: (ids: string[]) => void; goFind: () => void;
};
const uniq = (a: string[]) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'it'));

export default function Leads({ leads, selId, setSelId, checked, setChecked, onBatchAnalyze, onMark, onStrategy, goFind }: Props) {
  const [region, setRegion] = useState(''); const [province, setProvince] = useState(''); const [comune, setComune] = useState('');
  const [category, setCategory] = useState(''); const [status, setStatus] = useState<'' | Status>('');
  const [q, setQ] = useState(''); const [quick, setQuick] = useState<Set<string>>(new Set());
  const toggleQuick = (k: string) => setQuick((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const regions = useMemo(() => uniq(leads.map((l) => l.region)), [leads]);
  const provinces = useMemo(() => uniq(leads.filter((l) => !region || l.region === region).map((l) => l.province)), [leads, region]);
  const comuni = useMemo(() => uniq(leads.filter((l) => (!region || l.region === region) && (!province || l.province === province)).map((l) => l.comune)), [leads, region, province]);

  const rows = useMemo(() => leads.filter((l) =>
    (!region || l.region === region) && (!province || l.province === province) && (!comune || l.comune === comune) && (!category || l.category === category) && (!status || l.status === status) &&
    (!q || `${l.name} ${l.city} ${l.comune}`.toLowerCase().includes(q.toLowerCase())) &&
    (!quick.has('nosite') || !l.website) && (!quick.has('bad') || (l.audit && l.audit.score <= 5)) && (!quick.has('ads') || l.runsAds || l.ads?.ads.length) &&
    (!quick.has('wa') || mobileWhatsApp(l)) && (!quick.has('new') || (l.status === 'nuovo' || l.status === 'analizzato')) && !(quick.has('hide') && l.doNotContact))
    .map((l) => ({ l, o: opportunity(l).score })).sort((a, b) => b.o - a.o), [leads, region, province, comune, category, status, q, quick]);

  if (!leads.length) return <div className="card wide"><Empty icon="🔎" title="Non hai ancora nessun lead">Cerca attività in una zona per riempire il database.<br /><button className="pri" style={{ marginTop: 12 }} onClick={goFind}>Vai a Trova</button></Empty></div>;

  const ids = [...checked];
  const allChecked = rows.length > 0 && rows.every(({ l }) => checked.has(l.id));
  const QUICK: [string, string][] = [['nosite', 'Senza sito'], ['bad', 'Sito scadente'], ['ads', 'Fa ads'], ['wa', 'Con WhatsApp'], ['new', 'Non ancora contattati']];

  return (
    <div className="card">
      <div className="row">
        <select value={region} onChange={(e) => { setRegion(e.target.value); setProvince(''); setComune(''); }}><option value="">Tutte le regioni</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={province} onChange={(e) => { setProvince(e.target.value); setComune(''); }}><option value="">Tutte le province</option>{provinces.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={comune} onChange={(e) => setComune(e.target.value)}><option value="">Tutti i comuni</option>{comuni.map((r) => <option key={r}>{r}</option>)}</select>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Ogni categoria</option>{CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')}><option value="">Ogni stato</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <input placeholder="Cerca per nome" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips" style={{ marginTop: 8 }}>{QUICK.map(([k, v]) => <button key={k} className={'chip sm' + (quick.has(k) ? ' on' : '')} onClick={() => toggleQuick(k)}>{v}</button>)}
        <button className={'chip sm' + (quick.has('hide') ? ' on' : '')} onClick={() => toggleQuick('hide')}>Nascondi "non contattare"</button></div>
      <div className="row bar">
        <label><input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map(({ l }) => l.id)))} /> Seleziona tutti ({rows.length})</label>
        {ids.length > 0 && <>
          <b>{ids.length} scelti:</b>
          <button className="pri" onClick={() => onBatchAnalyze(ids)}>🔍 Analizza</button>
          <button className="pri" onClick={() => { onMark(ids, 'selezionato'); setChecked(new Set()); }}>✅ Da contattare</button>
          <button className="sec" onClick={() => onStrategy(ids)}>💬 Chiedi allo Stratega</button>
        </>}
      </div>
      <div className="list">
        {rows.length === 0 && <p className="muted">Nessun lead con questi filtri.</p>}
        {rows.map(({ l }) => (
          <div key={l.id} className={'item' + (l.id === selId ? ' sel' : '')} onClick={() => setSelId(l.id)}>
            <input type="checkbox" checked={checked.has(l.id)} onClick={(e) => e.stopPropagation()} onChange={() => { const n = new Set(checked); n.has(l.id) ? n.delete(l.id) : n.add(l.id); setChecked(n); }} />
            <Score lead={l} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{l.name}</b> <span className="badge">{STATUS_LABEL[l.status]}</span><br />
              <small className="muted">{l.comune || l.city} · {l.category}{!l.website && ' · senza sito'}{l.audit && ` · sito ${l.audit.score}/10`}{mobileWhatsApp(l) && ' · WhatsApp'}</small>
            </div>
          </div>))}
      </div>
    </div>
  );
}
