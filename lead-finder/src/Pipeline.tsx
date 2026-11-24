import { type Lead, type Status, STATUSES, STATUS_LABEL } from './model';
import { today } from './actions';

export default function Pipeline({ leads, patch, open }: { leads: Lead[]; patch: (id: string, p: Partial<Lead>) => void; open: (id: string) => void }) {
  const t = today();
  return (
    <div className="kan">
      {STATUSES.filter((s) => s !== 'nuovo' && s !== 'analizzato').map((s) => {
        const items = leads.filter((l) => l.status === s);
        return (
          <div key={s} className="card col"><h3>{STATUS_LABEL[s]} <span className="badge">{items.length}</span></h3>
            {items.length === 0 && <p className="muted">—</p>}
            {items.map((l) => (
              <div key={l.id} className="item col-item" onClick={() => open(l.id)}>
                <b>{l.name}</b><small className="muted">{l.comune || l.city}</small>
                {l.followUpAt && l.status === 'inviato' && <small className={l.followUpAt <= t ? 'alta' : 'muted'}>{l.followUpAt <= t ? '⏰ da ricontattare' : `ricontatto ${l.followUpAt}`}</small>}
                {l.callAt && <small className="media">📞 {l.callAt.replace('T', ' ')}</small>}
                <select value={l.status} onClick={(e) => e.stopPropagation()} onChange={(e) => patch(l.id, { status: e.target.value as Status })}>{STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}</select>
              </div>))}
          </div>);
      })}
    </div>
  );
}
