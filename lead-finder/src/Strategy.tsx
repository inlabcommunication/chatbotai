import { useEffect, useRef, useState } from 'react';
import { type Lead, opportunity, leadBrief } from './model';
import { ai } from './api';

const PROMPTS = [
  'Da chi conviene iniziare e perché?',
  'Fammi una strategia per i lead senza sito',
  'Quali lead fanno ads con una landing debole?',
  'Riassumi la pipeline e cosa devo fare oggi',
  'Come imposto i primi 10-15 messaggi?',
];

function digest(leads: Lead[], focus: Lead[]): string {
  const by = (f: (l: Lead) => string) => { const m: Record<string, number> = {}; leads.forEach((l) => { const k = f(l) || 'n/d'; m[k] = (m[k] ?? 0) + 1; }); return Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(', '); };
  const top = leads.filter((l) => !l.doNotContact).map((l) => ({ l, o: opportunity(l).score })).sort((a, b) => b.o - a.o).slice(0, 25).map((x) => leadBrief(x.l));
  return [`TOTALE LEAD: ${leads.length}`, `Per regione → ${by((l) => l.region)}`, `Per provincia → ${by((l) => l.province)}`, `Per categoria → ${by((l) => l.category)}`, `Per stato → ${by((l) => l.status)}`,
    `Senza sito: ${leads.filter((l) => !l.website).length}; con sito analizzato: ${leads.filter((l) => l.audit).length}; con ads: ${leads.filter((l) => l.runsAds || l.ads?.ads.length).length}`,
    focus.length ? `\nLEAD SELEZIONATI DA NICOLA (${focus.length}):\n${focus.slice(0, 12).map(leadBrief).join('\n---\n')}` : '',
    `\nTOP 25 PER OPPORTUNITÀ:\n${top.join('\n---\n')}`].join('\n');
}

type Msg = { role: 'user' | 'assistant'; content: string };
export default function Strategy({ leads, focusIds, aiReady, goSetup }: { leads: Lead[]; focusIds: string[]; aiReady: boolean; goSetup: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem('lead-finder:chat') ?? '[]'); } catch { return []; } });
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem('lead-finder:chat', JSON.stringify(msgs.slice(-30))); } catch { /* */ } end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send(t: string) {
    if (!t.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: t }];
    setMsgs(next); setText(''); setBusy(true); setErr('');
    try { const a = await ai('chat', next.slice(-12), digest(leads, leads.filter((l) => focusIds.includes(l.id)))); setMsgs([...next, { role: 'assistant', content: a }]); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (!aiReady) return <div className="card wide"><h2>Stratega</h2><p>Qui parli con un assistente che conosce tutto il tuo database e ti aiuta a decidere chi contattare e come.</p>
    <p className="muted">Per attivarlo serve collegare l'AI (chiave Anthropic): è uno dei collegamenti da fare insieme.</p><button className="pri" onClick={goSetup}>Vai a Collegamenti</button></div>;

  return (
    <div className="card wide chat">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Stratega</h2>{msgs.length > 0 && <button className="sec" onClick={() => setMsgs([])}>Nuova conversazione</button>}</div>
      {focusIds.length > 0 && <p className="ok">Sto guardando i {focusIds.length} lead che hai selezionato.</p>}
      <div className="msgs">
        {msgs.length === 0 && <div><p className="muted">Chiedimi qualsiasi cosa sul tuo database. Per esempio:</p><div className="chips">{PROMPTS.map((p) => <button key={p} className="chip" onClick={() => send(p)}>{p}</button>)}</div></div>}
        {msgs.map((m, i) => <div key={i} className={'bubble ' + m.role}>{m.content}</div>)}
        {busy && <div className="bubble assistant muted">Sto pensando…</div>}
        {err && <p className="alta">{err}</p>}
        <div ref={end} />
      </div>
      <div className="row"><textarea style={{ flex: 1, minHeight: 48 }} placeholder="Scrivi qui…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        <button className="pri" disabled={busy || !text.trim()} onClick={() => send(text)}>Invia</button></div>
    </div>
  );
}
