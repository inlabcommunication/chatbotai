// Modello della chat degli agenti: elenco agenti, conversazioni e calcolo del grafo.
// L'elenco degli id è duplicato in api/agent-chat.ts (le funzioni /api non importano da src/).

export const OWNER_ID = 'owner';
export const GROUP_ID = 'group';

export interface AgentInfo { id: string; name: string; role: string; color: string; short?: string }

export const OWNER: AgentInfo = { id: OWNER_ID, name: 'Titolare', role: 'Nicola', color: '#25d366', short: 'TI' };

export const AGENTS: AgentInfo[] = [
  { id: 'sito',        name: 'Sito Inlab',            role: 'Sviluppo e responsabile tecnico', color: '#7c9cff', short: 'SI' },
  { id: 'direttore',   name: 'Direttore Operativo',   role: 'Coordinamento e priorità',        color: '#ffb454', short: 'DO' },
  { id: 'seo',         name: 'Addetto SEO',           role: 'Strategia SEO e blog',            color: '#4ad2a4', short: 'SEO' },
  { id: 'blog',        name: 'Addetto al Blog',       role: 'Articoli',                        color: '#f07fb8', short: 'BL' },
  { id: 'performance', name: 'Addetto performance',   role: 'Velocità e accessibilità',        color: '#e8d44d', short: 'PF' },
  { id: 'competitor',  name: 'Analisi competitor',    role: 'Report sui concorrenti',          color: '#c08cff', short: 'CO' },
  { id: 'sicurezza',   name: 'Analista sicurezza',    role: 'Controlli (sola lettura)',        color: '#ff7a6b', short: 'SC' },
];

export const GROUP: AgentInfo = { id: GROUP_ID, name: 'Gruppo InLab', role: 'Tutti gli agenti e il titolare', color: '#8696a0' };

export const NODES: AgentInfo[] = [OWNER, ...AGENTS];
const BY_ID = new Map<string, AgentInfo>([...NODES.map(n => [n.id, n] as [string, AgentInfo]), [GROUP_ID, GROUP]]);
export const shortOf = (name: string): string => NODES.find(n => n.name === name)?.short ?? (name.startsWith('Gruppo') ? 'GR' : name.split(/[\s↔]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase());
export const infoOf = (id: string): AgentInfo =>
  BY_ID.get(id) ?? { id, name: id, role: '', color: '#8696a0' };

export interface AudioClip { b64: string; mime: string; sec: number }

export interface ChatMessage {
  id: string;
  from: string;
  to: string;          // id di un agente, 'owner' oppure 'group'
  conv: string;
  text?: string;
  audio?: AudioClip;
  createdAt: string;   // ISO
  wake?: Record<string, { status: 'sent' | 'failed' | 'skipped'; reason?: string; http?: number; at: string }>; // esito dell'avviso a ogni agente
  file?: { id: string; name: string; mime: string; size: number }; // allegato (contenuto scaricato a richiesta)
  readBy?: string[];   // agenti che hanno scaricato il messaggio (le spunte doppie)
}

/** Id della conversazione: gruppo, chat titolare↔agente, oppure scambio tra due agenti. */
export function convOf(from: string, to: string): string {
  if (to === GROUP_ID) return GROUP_ID;
  if (from === OWNER_ID) return `dm_${to}`;
  if (to === OWNER_ID) return `dm_${from}`;
  return `pair_${[from, to].sort().join('_')}`;
}

export interface ConvInfo {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  kind: 'group' | 'dm' | 'pair';
  readOnly: boolean;
  members: string[];
}

export function convInfo(id: string): ConvInfo {
  if (id === GROUP_ID) return { id, title: GROUP.name, subtitle: GROUP.role, color: GROUP.color, kind: 'group', readOnly: false, members: NODES.map(n => n.id) };
  if (id.startsWith('dm_')) {
    const a = infoOf(id.slice(3));
    return { id, title: a.name, subtitle: a.role, color: a.color, kind: 'dm', readOnly: false, members: [OWNER_ID, a.id] };
  }
  const ids = pairMembers(id);
  const [a, b] = ids.map(infoOf);
  return { id, title: `${a.name} ↔ ${b.name}`, subtitle: 'Conversazione tra agenti (sola lettura)', color: a.color, kind: 'pair', readOnly: true, members: ids };
}

/** I due agenti di una conversazione `pair_x_y` (gli id degli agenti non contengono "_"). */
export function pairMembers(id: string): string[] {
  return id.replace(/^pair_/, '').split('_').slice(0, 2);
}

export const previewOf = (m: ChatMessage): string => m.audio ? `🎤 Messaggio vocale (${fmtSec(m.audio.sec)})` : m.file ? `📎 ${m.file.name}${m.text ? ' · ' + m.text : ''}` : (m.text || '');

export const fmtSec = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ── Grafo delle interazioni ──────────────────────────────────

export interface GraphEdge { a: string; b: string; count: number; last: number }
export interface GraphGroupEdge { from: string; count: number; last: number }
export interface GraphStats {
  sent: Record<string, number>;
  received: Record<string, number>;
  edges: GraphEdge[];          // scambi diretti (coppie non ordinate)
  groupEdges: GraphGroupEdge[]; // messaggi inviati nel gruppo
  total: number;
}

export function buildGraph(messages: ChatMessage[], sinceMs: number | null): GraphStats {
  const sent: Record<string, number> = {};
  const received: Record<string, number> = {};
  const edges = new Map<string, GraphEdge>();
  const groups = new Map<string, GraphGroupEdge>();
  let total = 0;
  for (const m of messages) {
    const t = Date.parse(m.createdAt);
    if (sinceMs !== null && t < sinceMs) continue;
    total++;
    sent[m.from] = (sent[m.from] || 0) + 1;
    if (m.to === GROUP_ID) {
      const g = groups.get(m.from) ?? { from: m.from, count: 0, last: 0 };
      g.count++; g.last = Math.max(g.last, t); groups.set(m.from, g);
    } else {
      received[m.to] = (received[m.to] || 0) + 1;
      const [a, b] = [m.from, m.to].sort();
      const k = `${a}|${b}`;
      const e = edges.get(k) ?? { a, b, count: 0, last: 0 };
      e.count++; e.last = Math.max(e.last, t); edges.set(k, e);
    }
  }
  return { sent, received, edges: [...edges.values()], groupEdges: [...groups.values()], total };
}

// ── Dati dimostrativi (solo in memoria, per vedere l'aspetto prima che gli agenti scrivano) ──

export function demoMessages(): ChatMessage[] {
  const now = Date.now();
  const script: [number, string, string, string][] = [
    [300, 'direttore', 'group', 'Buongiorno a tutti. Priorità di oggi: articoli del blog e controllo velocità della home.'],
    [290, 'seo', 'group', 'Ricevuto. Ho aggiornato il brief con 3 richieste per lo sviluppo.'],
    [285, 'seo', 'sito', 'Ti ho scritto le modifiche ai title in docs/seo/brief: puoi applicarle?'],
    [280, 'sito', 'seo', 'Le applico adesso, un commit per punto. Faccio il controllo tecnico prima.'],
    [270, 'blog', 'seo', 'Qual è la keyword per il prossimo articolo?'],
    [265, 'seo', 'blog', 'Social media per ristoranti a Taranto. Intento: informativo locale.'],
    [250, 'performance', 'sito', 'LCP della home a 3,1 s: c\'è un\'immagine hero da ottimizzare.'],
    [245, 'sito', 'performance', 'Presa in carico, ti avviso con i commit per la rimisura.'],
    [230, 'sicurezza', 'sito', 'Nessun problema trovato nell\'ultimo controllo. Sito raggiungibile.'],
    [200, 'competitor', 'seo', 'Nuovo report competitor in docs/competitor: due agenzie hanno aperto un blog.'],
    [190, 'owner', 'direttore', 'Come stiamo messi con le priorità della settimana?'],
    [188, 'direttore', 'owner', 'Blog e velocità home in corso, SEO locale in attesa di una tua decisione.'],
    [60, 'sito', 'group', 'Commit applicati sul branch. Preview Vercel verde.'],
    [20, 'performance', 'group', 'Rimisurato: LCP 2,2 s. Confermato.'],
    [5, 'owner', 'group', 'Ottimo lavoro a tutti.'],
  ];
  return script.map(([minAgo, from, to, text], i) => ({
    id: `demo${i}`, from, to, conv: convOf(from, to), text,
    ...(from === 'owner' && i % 2 === 0 ? { readBy: [to === 'group' ? 'direttore' : to] } : {}),
    createdAt: new Date(now - minAgo * 60_000).toISOString(),
  }));
}
