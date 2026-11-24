import { useCallback, useEffect, useState } from 'react';
import { useLeads } from './store';
import { type Lead, type Status } from './model';
import { fullAnalysis } from './actions';
import { pool } from './api';
import Today from './Today';
import Find from './Find';
import Leads from './Leads';
import LeadPanel from './LeadPanel';
import Queue from './Queue';
import Pipeline from './Pipeline';
import Strategy from './Strategy';
import Setup, { loadStatus, type Status as ApiStatus } from './Setup';
import Report from './Report';
import { cloudConfigured } from './cloud';

type Tab = 'oggi' | 'trova' | 'lead' | 'coda' | 'pipeline' | 'strategia' | 'setup';
const TABS: [Tab, string, string][] = [['oggi', '🏠', 'Oggi'], ['trova', '🔎', 'Trova'], ['lead', '📋', 'Lead'], ['coda', '📨', 'Coda'], ['pipeline', '📊', 'Pipeline'], ['strategia', '💬', 'Strategia'], ['setup', '⚙️', 'Collegamenti']];

export default function App() {
  const { leads, upsertMany, patch, patchMany, remove, user, authReady, syncError } = useLeads();
  const [tab, setTab] = useState<Tab>('oggi');
  const [selId, setSelId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [job, setJob] = useState<{ label: string; done: number; total: number } | null>(null);
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [report, setReport] = useState<Lead | null>(null);
  const reload = useCallback(() => { loadStatus().then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(reload, [reload]);

  const sel = leads.find((l) => l.id === selId) ?? null;
  const open = (id: string) => { setSelId(id); setTab('lead'); };
  const mark = (ids: string[], s: Status = 'selezionato') => patchMany(ids, { status: s });

  async function batchAnalyze(ids: string[]) {
    const todo = leads.filter((l) => ids.includes(l.id));
    setErr(''); setJob({ label: 'Analisi in corso', done: 0, total: todo.length });
    await pool(todo, 2, async (l) => { patch(l.id, await fullAnalysis(l)); }, (done) => setJob({ label: 'Analisi in corso', done, total: todo.length }));
    setJob(null); setChecked(new Set());
  }

  if (!authReady) return <div className="empty">Caricamento…</div>;
  if (cloudConfigured && !user && tab !== 'setup') return (
    <div className="app-shell"><div className="card wide" style={{ margin: 24 }}><h2>Accedi</h2><p className="muted">Questa app è privata.</p><Setup status={status} reload={reload} user={user} syncError={syncError} /></div></div>);

  const aiReady = !!status?.ai;
  return (
    <>
      <div className="app-shell">
        <header><h1>Lead Finder</h1><button className="sec gear" onClick={() => setTab('setup')}>⚙️</button>
          <nav className="top">{TABS.map(([k, ic, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{ic} {label}{k === 'coda' && leads.filter((l) => l.status === 'selezionato').length > 0 && <i className="dot" />}</button>)}</nav>
        </header>
        {job && <div className="jobbar">{job.label}: {job.done}/{job.total}<div className="progress"><div style={{ width: `${(job.done / Math.max(1, job.total)) * 100}%` }} /></div></div>}
        {err && <div className="errbar" onClick={() => setErr('')}>⚠️ {err} <span className="muted">(tocca per chiudere)</span></div>}
        {cloudConfigured && syncError && <div className="errbar">Sincronizzazione: {syncError}</div>}
        <main>
          {tab === 'oggi' && <Today leads={leads} open={open} goFind={() => setTab('trova')} goLeads={() => setTab('lead')} goQueue={() => setTab('coda')} onMark={(ids) => { mark(ids); setTab('coda'); }} />}
          {tab === 'trova' && <Find onAdd={upsertMany} onDone={() => setTab('lead')} />}
          {tab === 'lead' && <div className={'split' + (sel ? ' has-sel' : '')}>
            <Leads leads={leads} selId={selId} setSelId={setSelId} checked={checked} setChecked={setChecked} onBatchAnalyze={batchAnalyze} onMark={(ids, s) => mark(ids, s)}
              onStrategy={(ids) => { setFocus(ids); setTab('strategia'); }} goFind={() => setTab('trova')} />
            <div className="card detail">{sel ? <LeadPanel key={sel.id} l={sel} patch={(p) => patch(sel.id, p)} remove={() => { remove(sel.id); setSelId(null); }} aiReady={aiReady}
              onBack={() => setSelId(null)} onReport={() => setReport(sel)} setErr={setErr} /> : <p className="muted">Scegli un lead dalla lista per vedere analisi, messaggio e storico.</p>}</div>
          </div>}
          {tab === 'coda' && <Queue leads={leads} patch={patch} goLeads={() => setTab('lead')} />}
          {tab === 'pipeline' && <Pipeline leads={leads} patch={patch} open={open} />}
          {tab === 'strategia' && <Strategy leads={leads} focusIds={focus} aiReady={aiReady} goSetup={() => setTab('setup')} />}
          {tab === 'setup' && <Setup status={status} reload={reload} user={user} syncError={syncError} />}
        </main>
        <nav className="bottom">{TABS.filter(([k]) => k !== 'setup').map(([k, ic, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{ic}</span>{label}</button>)}</nav>
      </div>
      {report && <Report lead={report} onClose={() => setReport(null)} />}
    </>
  );
}
