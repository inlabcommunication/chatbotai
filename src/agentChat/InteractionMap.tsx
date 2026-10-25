import { useMemo, useState } from 'react';
import { buildGraph, infoOf, GROUP, GROUP_ID, NODES, OWNER_ID, type ChatMessage } from './model';

const RANGES: { id: string; label: string; ms: number | null }[] = [
  { id: '24h', label: '24 ore', ms: 86_400_000 },
  { id: '7d', label: '7 giorni', ms: 7 * 86_400_000 },
  { id: '30d', label: '30 giorni', ms: 30 * 86_400_000 },
  { id: 'all', label: 'Tutto', ms: null },
];

const W = 820, H = 620, CX = W / 2, CY = H / 2, R = 235;

export const InteractionMap = ({ messages, onOpenConv }: { messages: ChatMessage[]; onOpenConv: (id: string) => void }) => {
  const [range, setRange] = useState('7d');
  const [sel, setSel] = useState<string | null>(null);
  const ms = RANGES.find(r => r.id === range)!.ms;
  const g = useMemo(() => buildGraph(messages, ms === null ? null : Date.now() - ms), [messages, ms]);

  const pos = useMemo(() => {
    const p: Record<string, { x: number; y: number }> = { [GROUP_ID]: { x: CX, y: CY } };
    NODES.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / NODES.length;
      p[n.id] = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    });
    return p;
  }, []);

  const maxCount = Math.max(1, ...g.edges.map(e => e.count), ...g.groupEdges.map(e => e.count));
  const maxSent = Math.max(1, ...Object.values<number>(g.sent));
  const recent = Date.now() - 15 * 60_000;
  const touches = (a: string, b: string) => !sel || a === sel || b === sel;

  const selInfo = sel ? infoOf(sel) : null;
  const partners = sel
    ? g.edges.filter(e => e.a === sel || e.b === sel).map(e => ({ id: e.a === sel ? e.b : e.a, count: e.count })).sort((x, y) => y.count - x.count)
    : [];
  const topPairs = [...g.edges].sort((a, b) => b.count - a.count).slice(0, 6);

  return (
    <div className="wa-map">
      <div className="wa-map-head">
        <div>
          <h2>Mappa delle interazioni</h2>
          <p>Ogni cerchio è un agente (o il titolare): più messaggi invia, più è grande. Le linee spesse sono le coppie che si parlano di più; le linee tratteggiate verso il centro sono i messaggi nel gruppo. I puntini che corrono sulle linee indicano scambi negli ultimi 15 minuti.</p>
        </div>
        <div className="wa-seg">
          {RANGES.map(r => (
            <button key={r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="wa-map-body">
        <svg viewBox={`0 0 ${W} ${H}`} className="wa-svg" role="img" aria-label="Grafo delle interazioni tra agenti" onClick={() => setSel(null)}>
          {/* messaggi di gruppo */}
          {g.groupEdges.map(e => {
            const a = pos[e.from]; if (!a) return null;
            const on = touches(e.from, GROUP_ID);
            return (
              <g key={`g-${e.from}`} opacity={on ? 1 : 0.12}>
                <line x1={a.x} y1={a.y} x2={CX} y2={CY} stroke={infoOf(e.from).color} strokeWidth={1 + (e.count / maxCount) * 5} strokeDasharray="5 6" strokeOpacity=".55" />
                {e.last > recent && <Pulse x1={a.x} y1={a.y} x2={CX} y2={CY} color={infoOf(e.from).color} />}
              </g>
            );
          })}
          {/* scambi diretti */}
          {g.edges.map(e => {
            const a = pos[e.a], b = pos[e.b]; if (!a || !b) return null;
            const on = touches(e.a, e.b);
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g key={`${e.a}|${e.b}`} opacity={on ? 1 : 0.1}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={infoOf(e.a).color} strokeWidth={1.5 + (e.count / maxCount) * 8} strokeOpacity=".5" strokeLinecap="round" />
                {e.last > recent && <Pulse x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={infoOf(e.a).color} />}
                <g transform={`translate(${mx},${my})`}>
                  <rect x="-13" y="-9" width="26" height="18" rx="9" fill="#111b21" stroke="rgba(255,255,255,.18)" />
                  <text textAnchor="middle" dy="4" fontSize="11" fill="#e9edef">{e.count}</text>
                </g>
              </g>
            );
          })}
          {/* nodo gruppo */}
          <g transform={`translate(${CX},${CY})`} opacity={!sel || sel === GROUP_ID ? 1 : 0.5}>
            <circle r="34" fill="#202c33" stroke="rgba(255,255,255,.2)" strokeDasharray="3 4" />
            <text textAnchor="middle" dy="-2" fontSize="11" fill="#e9edef" fontWeight="600">GRUPPO</text>
            <text textAnchor="middle" dy="12" fontSize="10" fill="#8696a0">{g.groupEdges.reduce((s, e) => s + e.count, 0)} msg</text>
          </g>
          {/* agenti */}
          {NODES.map(n => {
            const p = pos[n.id];
            const r = 26 + ((g.sent[n.id] || 0) / maxSent) * 14;
            const dim = sel && sel !== n.id && !g.edges.some(e => (e.a === sel && e.b === n.id) || (e.b === sel && e.a === n.id)) && !(g.groupEdges.some(e => e.from === sel) && g.groupEdges.some(e => e.from === n.id));
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.3 : 1} style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); setSel(sel === n.id ? null : n.id); }}>
                <circle r={r + 5} fill={n.color} opacity={sel === n.id ? 0.25 : 0.1} />
                <circle r={r} fill={n.color} stroke="#0b141a" strokeWidth="3" />
                <text textAnchor="middle" dy="5" fontSize={n.id === OWNER_ID ? 15 : 14} fontWeight="700" fill="#0b141a">{n.short}</text>
                <text textAnchor="middle" y={r + 18} fontSize="12" fill="#e9edef" stroke="#111b21" strokeWidth="4" paintOrder="stroke">{n.name}</text>
                <text textAnchor="middle" y={r + 32} fontSize="10.5" fill="#8696a0" stroke="#111b21" strokeWidth="4" paintOrder="stroke">{g.sent[n.id] || 0} inviati · {g.received[n.id] || 0} ricevuti</text>
              </g>
            );
          })}
        </svg>

        <aside className="wa-map-side">
          {selInfo ? (
            <>
              <h3 style={{ color: selInfo.color }}>{selInfo.name}</h3>
              <p className="wa-muted">{selInfo.role}</p>
              <ul className="wa-stats">
                <li><b>{g.sent[sel!] || 0}</b> messaggi inviati</li>
                <li><b>{g.received[sel!] || 0}</b> ricevuti in privato</li>
                <li><b>{g.groupEdges.find(e => e.from === sel)?.count || 0}</b> nel gruppo</li>
              </ul>
              <h4>Parla soprattutto con</h4>
              {partners.length === 0 && <p className="wa-muted">Nessuno scambio diretto nel periodo.</p>}
              {partners.map(p => (
                <button key={p.id} className="wa-row" onClick={() => onOpenConv(convFor(sel!, p.id))}>
                  <i style={{ background: infoOf(p.id).color }} />{infoOf(p.id).name}<em>{p.count}</em>
                </button>
              ))}
              <button className="wa-link" onClick={() => setSel(null)}>Mostra tutti</button>
            </>
          ) : (
            <>
              <h3>Coppie più attive</h3>
              {topPairs.length === 0 && <p className="wa-muted">Nessun messaggio nel periodo scelto.</p>}
              {topPairs.map(p => (
                <button key={`${p.a}|${p.b}`} className="wa-row" onClick={() => onOpenConv(convFor(p.a, p.b))}>
                  <i style={{ background: infoOf(p.a).color }} /><i style={{ background: infoOf(p.b).color, marginLeft: -8 }} />
                  {infoOf(p.a).name} ↔ {infoOf(p.b).name}<em>{p.count}</em>
                </button>
              ))}
              <p className="wa-muted" style={{ marginTop: 14 }}>{g.total} messaggi nel periodo. Tocca un cerchio per vedere i suoi collegamenti.</p>
              <p className="wa-muted">{GROUP.name}: {g.groupEdges.reduce((s, e) => s + e.count, 0)} messaggi.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};


function convFor(a: string, b: string): string {
  if (a === OWNER_ID) return `dm_${b}`;
  if (b === OWNER_ID) return `dm_${a}`;
  return `pair_${[a, b].sort().join('_')}`;
}

/** Puntino che percorre la linea: scambio avvenuto da poco. */
const Pulse = ({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) => (
  <circle r="4.5" fill={color}>
    <animateMotion dur="2.4s" repeatCount="indefinite" path={`M${x1},${y1} L${x2},${y2}`} />
    <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" repeatCount="indefinite" />
  </circle>
);
