import { type Lead, opportunity, STATUS_LABEL } from './model';
import { today } from './actions';
import { Score } from './ui';

type Props = { leads: Lead[]; open: (id: string) => void; goFind: () => void; goLeads: () => void; goQueue: () => void; onMark: (ids: string[]) => void };
export default function Today({ leads, open, goFind, goLeads, goQueue, onMark }: Props) {
  const t = today();
  const due = leads.filter((l) => l.status === 'inviato' && l.followUpAt && l.followUpAt <= t);
  const calls = leads.filter((l) => l.callAt && l.status === 'call').sort((a, b) => (a.callAt! < b.callAt! ? -1 : 1));
  const queued = leads.filter((l) => l.status === 'selezionato').length;
  const best = leads.filter((l) => (l.status === 'nuovo' || l.status === 'analizzato') && !l.doNotContact).map((l) => ({ l, o: opportunity(l).score })).sort((a, b) => b.o - a.o).slice(0, 5);
  const count = (s: Lead['status']) => leads.filter((l) => l.status === s).length;

  if (!leads.length) return (
    <div className="card wide"><h2>Benvenuto 👋</h2><p>In 3 passi trovi i tuoi primi clienti:</p>
      <ol className="how"><li><b>Cerca</b> un tipo di attività in una zona (es. B&B in provincia di Lecce).</li><li><b>Analizza</b>: l'app valuta sito, social e pubblicità e ti dice a chi conviene scrivere.</li><li><b>Contatta</b>: messaggi WhatsApp già pronti, li invii con un clic.</li></ol>
      <button className="pri big" onClick={goFind}>Inizia: cerca attività</button></div>);

  return (
    <div className="stack">
      <div className="tiles">
        <div className="tile"><b>{leads.length}</b><span>lead nel database</span></div>
        <div className="tile" onClick={goQueue}><b>{queued}</b><span>da contattare</span></div>
        <div className="tile"><b>{count('inviato')}</b><span>in attesa di risposta</span></div>
        <div className="tile"><b>{count('risposto') + count('call') + count('proposta')}</b><span>conversazioni aperte</span></div>
        <div className="tile"><b>{count('cliente')}</b><span>clienti</span></div>
      </div>
      {queued > 0 && <div className="card cta"><div><b>{queued} attività pronte da contattare</b><div className="muted">Apri la coda: un clic per ogni messaggio WhatsApp.</div></div><button className="pri big" onClick={goQueue}>Apri la coda ➜</button></div>}
      {due.length > 0 && <div className="card"><h3>⏰ Da ricontattare oggi ({due.length})</h3>{due.map((l) => <div key={l.id} className="item" onClick={() => open(l.id)}><b>{l.name}</b><span className="muted"> · scritto il {l.contactedAt?.slice(0, 10)}</span></div>)}</div>}
      {calls.length > 0 && <div className="card"><h3>📞 Call in programma</h3>{calls.map((l) => <div key={l.id} className="item" onClick={() => open(l.id)}><b>{l.name}</b><span className="media"> · {l.callAt!.replace('T', ' ')}</span><span className="muted"> · report e analisi pronti nella scheda</span></div>)}</div>}
      {best.length > 0 && <div className="card"><div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>🎯 Migliori opportunità non ancora contattate</h3><button className="sec" onClick={() => onMark(best.map((b) => b.l.id))}>Aggiungi tutte alla coda</button></div>
        {best.map(({ l }) => <div key={l.id} className="item" onClick={() => open(l.id)}><Score lead={l} size={36} /><div><b>{l.name}</b> <span className="badge">{STATUS_LABEL[l.status]}</span><br /><small className="muted">{opportunity(l).reasons.join(' · ') || 'Da analizzare'}</small></div></div>)}
        <button className="sec" style={{ marginTop: 8 }} onClick={goLeads}>Vedi tutti i lead</button></div>}
    </div>
  );
}
