import { opportunity, type Lead } from './model';
import { Issues } from './ui';

/** Report stampabile: dal browser "Stampa → Salva come PDF". */
export default function Report({ lead: l, onClose }: { lead: Lead; onClose: () => void }) {
  const o = opportunity(l);
  return (
    <div className="report-overlay">
      <div className="noprint row" style={{ marginBottom: 12 }}>
        <button className="pri" onClick={() => window.print()}>🖨️ Stampa / Salva PDF</button>
        <button className="sec" onClick={onClose}>Chiudi</button>
        <span className="muted">Nel box di stampa scegli "Salva come PDF".</span>
      </div>
      <div className="paper">
        <h1>Analisi della presenza online</h1>
        <h2>{l.name}</h2>
        <p className="muted">{[...new Set([l.address, l.comune || l.city, l.province, l.region].filter(Boolean))].join(', ')} · Report del {new Date().toLocaleDateString('it-IT')}</p>
        <p><b>Opportunità di miglioramento: {o.score}/100.</b> {o.reasons.join(' · ')}</p>
        {l.audit && <><h3>Il sito web — voto {l.audit.score}/10</h3><Issues items={l.audit.issues} /></>}
        {!l.website && <><h3>Il sito web</h3><p>Non abbiamo trovato un sito web collegato all'attività: i clienti che cercano online non riescono ad approfondire.</p></>}
        {l.social && Object.entries(l.social).filter(([, s]) => !s.blocked).map(([k, s]) => <p key={k}><b>{k}:</b> {s.followers ?? '?'} follower, {s.posts ?? '?'} post. {s.notes?.join('. ')}</p>)}
        {l.landings?.map((x) => <div key={x.url}><h3>Pagina delle inserzioni — voto {x.score}/10</h3><p className="muted">{x.url}</p><Issues items={x.issues} />
          <h4>Struttura consigliata per una pagina che converte</h4><ol>{x.proposal.map((p) => <li key={p.section}><b>{p.section}</b>: {p.content}</li>)}</ol></div>)}
        <h3>Prossimo passo</h3>
        <p>Possiamo sistemare in ordine di priorità i punti segnalati. Una chiamata di 15 minuti è sufficiente per definire cosa serve davvero a {l.name}.</p>
        <p className="muted">InLab — report realizzato analizzando informazioni pubbliche.</p>
      </div>
    </div>
  );
}
