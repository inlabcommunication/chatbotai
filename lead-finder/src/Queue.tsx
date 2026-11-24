import { useState } from 'react';
import { type Lead, draftMessage, mobileWhatsApp, waLink, mailLink, emailOf, opportunity } from './model';
import { inDays } from './actions';
import { Empty } from './ui';

type Props = { leads: Lead[]; patch: (id: string, p: Partial<Lead>) => void; goLeads: () => void };

export default function Queue({ leads, patch, goLeads }: Props) {
  const pool = leads.filter((l) => l.status === 'selezionato' && !l.doNotContact);
  const wa = pool.filter((l) => mobileWhatsApp(l)).sort((a, b) => opportunity(b).score - opportunity(a).score);
  const noWa = pool.filter((l) => !mobileWhatsApp(l));
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const todo = wa.filter((l) => !skipped.has(l.id));
  const cur = todo[0];
  const sentToday = leads.filter((l) => l.contactedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  if (!pool.length) return <div className="card wide"><Empty icon="📨" title="La coda è vuota">Nella scheda Lead seleziona le attività interessanti e premi <b>Da contattare</b>: compariranno qui, pronte da inviare una alla volta.<br /><button className="pri" style={{ marginTop: 12 }} onClick={goLeads}>Vai ai Lead</button></Empty></div>;

  return (
    <div className="card wide">
      <h2>Coda di invio <span className="muted">— oggi inviati: {sentToday}</span></h2>
      {cur ? <>
        <div className="progress"><div style={{ width: `${(1 - todo.length / wa.length) * 100}%` }} /></div>
        <p className="muted">{wa.length - todo.length} fatti · {todo.length} da inviare</p>
        <h3 style={{ marginTop: 6 }}>{cur.name} <span className="muted">· {cur.comune || cur.city}</span></h3>
        <p className="muted">{opportunity(cur).reasons.join(' · ')}</p>
        <textarea style={{ minHeight: 140 }} value={cur.message ?? cur.outreach?.whatsapp ?? draftMessage(cur)} onChange={(e) => patch(cur.id, { message: e.target.value })} />
        <div className="row" style={{ marginTop: 8 }}>
          <a className="wa big" target="_blank" rel="noreferrer" href={waLink(cur, cur.message ?? cur.outreach?.whatsapp ?? draftMessage(cur))!}
            onClick={() => patch(cur.id, { status: 'inviato', contactedAt: new Date().toISOString(), followUpAt: inDays(4) })}>Apri WhatsApp ➜ poi torna qui</a>
          <button className="sec" onClick={() => setSkipped(new Set([...skipped, cur.id]))}>Salta</button>
          <button className="sec" onClick={() => patch(cur.id, { status: 'perso', doNotContact: true })}>Non adatto</button>
        </div>
        <p className="muted">Premi invio su WhatsApp, poi torna all'app: la prossima attività è già pronta. Al follow-up ci pensa l'app (4 giorni).</p>
      </> : <p className="ok">🎉 Hai finito i messaggi WhatsApp della coda.</p>}
      {noWa.length > 0 && <>
        <h3>Senza cellulare ({noWa.length}) — contatto via email</h3>
        {noWa.map((l) => <div key={l.id} className="item"><div style={{ flex: 1 }}><b>{l.name}</b><br /><small className="muted">{l.phone ? 'solo telefono fisso' : 'nessun numero'} · {emailOf(l) || 'nessuna email'}</small></div>
          {emailOf(l) ? <a className="sec linkbtn" href={mailLink(l, l.outreach?.email_subject ?? `Idee per migliorare la visibilità di ${l.name}`, l.outreach?.email_body ?? draftMessage(l))} onClick={() => patch(l.id, { status: 'inviato', contactedAt: new Date().toISOString(), followUpAt: inDays(4) })}>✉️ Scrivi email</a> : <span className="muted">Apri la scheda per altre vie</span>}</div>)}
      </>}
    </div>
  );
}
