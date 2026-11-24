import { useMemo, useState } from 'react';
import { useLeads, authHeaders } from './store';
import { STATUSES, opportunity, mobileWhatsApp, waLink, draftMessage, type Lead, type Status } from './model';

const CATEGORIES = ['ristorante', 'pizzeria', 'bar', 'bnb', 'hotel', 'agriturismo', 'parrucchiere', 'dentista', 'palestra', 'abbigliamento', 'officina'];

export default function App() {
  const { leads, upsertMany, patch, remove } = useLeads();
  const [view, setView] = useState<'lead' | 'crm'>('lead');
  const [category, setCategory] = useState('ristorante');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<'' | Status>('');
  const [fNoSite, setFNoSite] = useState(false);
  const [q, setQ] = useState('');

  async function search() {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/search?category=${category}&place=${encodeURIComponent(place)}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Errore');
      upsertMany(d.leads.map((l: Lead) => ({ ...l, place, status: 'nuovo' as Status, notes: '' })));
      if (!d.count) setErr('Nessun risultato: prova il nome esatto del comune (es. "Lecce") o un\'altra categoria.');
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  }

  async function audit(l: Lead) {
    if (!l.website) return;
    patch(l.id, { auditedAt: undefined });
    try {
      const r = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ url: l.website }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      patch(l.id, { audit: d, auditedAt: new Date().toISOString(), status: l.status === 'nuovo' ? 'analizzato' : l.status });
    } catch (e) { setErr(`Audit non riuscito: ${(e as Error).message}`); }
  }

  const rows = useMemo(() => leads
    .filter((l) => (!fStatus || l.status === fStatus) && (!fNoSite || !l.website) && (!q || (l.name + l.city + l.place).toLowerCase().includes(q.toLowerCase())))
    .map((l) => ({ l, o: opportunity(l) }))
    .sort((a, b) => b.o.score - a.o.score), [leads, fStatus, fNoSite, q]);
  const sel = leads.find((l) => l.id === selId) ?? null;

  return (
    <>
      <header>
        <h1>Lead Finder</h1>
        <nav><button className={view === 'lead' ? 'on' : ''} onClick={() => setView('lead')}>Lead ({leads.length})</button><button className={view === 'crm' ? 'on' : ''} onClick={() => setView('crm')}>CRM</button></nav>
      </header>
      {view === 'lead' ? (
        <main>
          <section className="card">
            <div className="row">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
              <input placeholder="Comune o provincia (es. Lecce)" value={place} onChange={(e) => setPlace(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && place && search()} />
              <button className="pri" disabled={busy || place.trim().length < 2} onClick={search}>{busy ? 'Cerco…' : 'Cerca'}</button>
            </div>
            {err && <p className="alta">{err}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <input placeholder="Filtra per nome/zona" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value as Status | '')}><option value="">tutti gli stati</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              <label className="muted"><input type="checkbox" checked={fNoSite} onChange={(e) => setFNoSite(e.target.checked)} /> senza sito</label>
            </div>
            <div className="list">
              {rows.length === 0 && <p className="muted">Nessun lead. Cerca una categoria in una zona per iniziare.</p>}
              {rows.map(({ l, o }) => (
                <div key={l.id} className={'item' + (l.id === selId ? ' sel' : '')} onClick={() => setSelId(l.id)}>
                  <b>{l.name}</b> <span className="badge">{l.status}</span><br />
                  <small>{l.category} · {l.city || l.place} · opportunità <b className="score">{o.score}</b>{l.audit && <> · sito {l.audit.score}/10</>}{!l.website && ' · senza sito'}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="card">{sel ? <Detail l={sel} patch={(p) => patch(sel.id, p)} audit={() => audit(sel)} remove={() => { remove(sel.id); setSelId(null); }} /> : <p className="muted">Seleziona un lead per vedere analisi e messaggio.</p>}</section>
        </main>
      ) : (
        <main><div className="kan">{STATUSES.map((s) => (
          <div key={s} className="card"><h3>{s} ({leads.filter((l) => l.status === s).length})</h3>
            {leads.filter((l) => l.status === s).map((l) => <div key={l.id} className="item" onClick={() => { setSelId(l.id); setView('lead'); }}><b>{l.name}</b><br /><small>{l.city || l.place}{l.followUpAt && ` · ricontatto ${l.followUpAt}`}{l.callAt && ` · call ${l.callAt.replace('T', ' ')}`}</small></div>)}
          </div>))}</div></main>
      )}
    </>
  );
}

function Detail({ l, patch, audit, remove }: { l: Lead; patch: (p: Partial<Lead>) => void; audit: () => void; remove: () => void }) {
  const o = opportunity(l);
  const [msg, setMsg] = useState('');
  const text = msg || draftMessage(l);
  const wa = waLink(l, text);
  const a = l.audit;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{l.name}</h2><button className="sec" onClick={remove}>Elimina</button></div>
      <p className="muted">{[l.address, l.postcode, l.city].filter(Boolean).join(' ') || l.place} · {l.category}</p>
      <p>📞 {l.phone || '—'} · ✉️ {l.email || a?.emails[0] || '—'}<br />🌐 {l.website ? <a href={l.website.startsWith('http') ? l.website : 'https://' + l.website} target="_blank" rel="noreferrer">{l.website}</a> : <span className="alta">nessun sito noto</span>}</p>
      <p>Opportunità: <b className="score">{o.score}/100</b> <span className="muted">— {o.reasons.join(', ') || 'da analizzare'}</span></p>
      <div className="row"><select value={l.status} onChange={(e) => patch({ status: e.target.value as Status })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        {l.website && <button className="sec" onClick={audit}>{a ? 'Rifai analisi sito' : 'Analizza sito'}</button>}</div>
      {a && (<>
        <h3>Analisi sito — voto <span className="score">{a.score}/10</span>{a.builder && <> · {a.builder}</>}</h3>
        {a.pagespeed && <p className="muted">PageSpeed mobile: velocità {Math.round(a.pagespeed.performance * 100)} · SEO {Math.round(a.pagespeed.seo * 100)} · accessibilità {Math.round(a.pagespeed.accessibility * 100)}</p>}
        {a.issues.map((i, k) => <p key={k} style={{ margin: '4px 0' }}><b className={i.severity}>● {i.problem}</b><br /><span className="muted">→ {i.proposal}</span></p>)}
        {a.issues.length === 0 && <p>Nessun problema evidente.</p>}
        {Object.entries(a.social).filter(([, v]) => v).map(([k, v]) => <span key={k} className="badge"><a href={v} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{k}</a></span>)}
      </>)}
      <h3>Messaggio WhatsApp</h3>
      <textarea value={text} onChange={(e) => setMsg(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        {wa ? <a className="wa" href={wa} target="_blank" rel="noreferrer" onClick={() => patch({ status: 'inviato', contactedAt: new Date().toISOString(), followUpAt: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10) })}>Apri su WhatsApp ({mobileWhatsApp(l)})</a>
          : <span className="muted">Nessun cellulare disponibile (i fissi non hanno WhatsApp). Prova con email o Instagram.</span>}
        <button className="sec" onClick={() => navigator.clipboard.writeText(text)}>Copia testo</button>
      </div>
      <h3>CRM</h3>
      <div className="row"><label className="muted">Ricontatto <input type="date" value={l.followUpAt ?? ''} onChange={(e) => patch({ followUpAt: e.target.value })} /></label>
        <label className="muted">Call <input type="datetime-local" value={l.callAt ?? ''} onChange={(e) => patch({ callAt: e.target.value, ...(e.target.value && { status: 'call' as Status }) })} /></label></div>
      <textarea placeholder="Note, esito della call, obiezioni…" value={l.notes} onChange={(e) => patch({ notes: e.target.value })} style={{ marginTop: 8 }} />
    </>
  );
}
