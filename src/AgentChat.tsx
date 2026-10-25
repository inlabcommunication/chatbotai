import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { addDoc, collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowLeft, Mic, Send, Network, MessageCircle, Search, Eye, Sparkles } from 'lucide-react';
import { auth, db } from './firebase';
import {
  AGENTS, GROUP_ID, OWNER_ID, convInfo, convOf, demoMessages, infoOf, previewOf, shortOf,
  type AudioClip, type ChatMessage, type ConvInfo,
} from './agentChat/model';
import { Recorder, VoiceBubble } from './agentChat/Voice';
import { InteractionMap } from './agentChat/InteractionMap';
import { agentChatStyles } from './agentChat/styles';

const COLLECTION = 'agent_messages';
const SEEN_KEY = 'agentchat_seen';

const loadSeen = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
const saveSeen = (s: Record<string, string>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* storage non disponibile */ } };

/** Avvisa il server, che sveglia la routine dell'agente (se ne ha una). Non blocca mai l'invio. */
async function wakeAgent(to: string, id: string, kind: 'text' | 'voice') {
  try {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    await fetch('/api/notify-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, id, kind }),
    });
  } catch { /* la sveglia è facoltativa: il messaggio è già salvato */ }
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
function dayLabel(iso: string): string {
  const d = new Date(iso), t = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(t.getTime() - 86_400_000);
  if (same(d, t)) return 'Oggi';
  if (same(d, y)) return 'Ieri';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}
const listTime = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? hhmm(iso) : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
};

const Avatar = ({ color, label, size = 46 }: { color: string; label: string; size?: number }) => (
  <span className="wa-av" style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}>{label}</span>
);
const abbr = shortOf;

export const AgentChat = ({ onLogout }: { onLogout?: () => void }) => {
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'map'>('chat');
  const [active, setActive] = useState<string>(GROUP_ID);
  const [mobileChat, setMobileChat] = useState(false);
  const [filter, setFilter] = useState('');
  const [seen, setSeen] = useState<Record<string, string>>(loadSeen);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(800));
    return onSnapshot(q, snap => {
      setError(null);
      setLive(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })).reverse());
    }, () => setError('Impossibile leggere i messaggi. Controlla che le regole Firestore siano state pubblicate (vedi docs/sviluppo/AGENT-CHAT.md).'));
  }, []);

  const messages = demo ? demoMessages() : live;

  const byConv = useMemo(() => {
    const m = new Map<string, ChatMessage[]>();
    for (const x of messages) { const a = m.get(x.conv) ?? []; a.push(x); m.set(x.conv, a); }
    return m;
  }, [messages]);

  // Elenco conversazioni: gruppo, una chat per agente, poi gli scambi tra agenti già avvenuti
  const convs: ConvInfo[] = useMemo(() => {
    const ids = [GROUP_ID, ...AGENTS.map(a => `dm_${a.id}`)];
    const pairs = [...byConv.keys()].filter(k => k.startsWith('pair_'));
    return [...ids, ...pairs].map(convInfo);
  }, [byConv]);

  const lastAt = (id: string) => byConv.get(id)?.at(-1)?.createdAt ?? '';
  const sorted = useMemo(() => {
    const [group, ...rest] = convs;
    const fixed = rest.filter(c => c.kind === 'dm').sort((a, b) => lastAt(b.id).localeCompare(lastAt(a.id)));
    const pairs = rest.filter(c => c.kind === 'pair').sort((a, b) => lastAt(b.id).localeCompare(lastAt(a.id)));
    return { head: [group, ...fixed], pairs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs, byConv]);

  const unread = (id: string) => {
    const s = seen[id] || '';
    return (byConv.get(id) ?? []).filter(m => m.from !== OWNER_ID && m.createdAt > s).length;
  };

  const cur = convInfo(active);
  const thread = byConv.get(active) ?? [];
  const lastInThread = thread.at(-1)?.createdAt;

  useEffect(() => {
    if (view !== 'chat' || !lastInThread || (seen[active] || '') >= lastInThread) return;
    const next = { ...seen, [active]: lastInThread };
    setSeen(next); saveSeen(next);
  }, [active, lastInThread, view, seen]);

  const open = (id: string) => { setActive(id); setMobileChat(true); setView('chat'); };
  const match = (c: ConvInfo) => !filter || c.title.toLowerCase().includes(filter.toLowerCase());

  const send = async (payload: { text?: string; audio?: AudioClip }) => {
    if (!db || demo) { setError(demo ? 'Anteprima dimostrativa: esci dalla demo per inviare messaggi veri.' : 'Database non configurato.'); return; }
    const to = cur.kind === 'group' ? GROUP_ID : cur.members.find(m => m !== OWNER_ID)!;
    try {
      const ref = await addDoc(collection(db, COLLECTION), { from: OWNER_ID, to, conv: convOf(OWNER_ID, to), ...payload, createdAt: new Date().toISOString() });
      setError(null);
      wakeAgent(to, ref.id, payload.audio ? 'voice' : 'text');
    } catch {
      setError('Messaggio non inviato. Controlla la connessione e le regole Firestore.');
    }
  };

  return (
    <div className="wa-root" data-mobile={mobileChat ? 'chat' : 'list'}>
      <style>{agentChatStyles}</style>

      <div className="wa-tabs">
        <button className={view === 'chat' ? 'on' : ''} onClick={() => setView('chat')}><MessageCircle size={15} /> Chat</button>
        <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}><Network size={15} /> Mappa interazioni</button>
        <span style={{ flex: 1 }} />
        <button className={demo ? 'on' : ''} onClick={() => setDemo(d => !d)} title="Mostra dati di esempio, senza scrivere nulla">
          <Sparkles size={15} /> {demo ? 'Esci dalla demo' : 'Anteprima demo'}
        </button>
      </div>

      {error && <div className="wa-error" onClick={() => setError(null)}>{error}</div>}

      {view === 'map' ? (
        <InteractionMap messages={messages} onOpenConv={open} />
      ) : (
        <div className="wa-shell">
          <aside className="wa-list">
            <div className="wa-list-head">Chat degli agenti{onLogout && <button onClick={onLogout} className="wa-exit">Esci</button>}</div>
            <label className="wa-search"><Search size={15} /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Cerca un agente" /></label>
            <div className="wa-scroll">
              {sorted.head.filter(match).map(c => <ConvRow key={c.id} c={c} last={byConv.get(c.id)?.at(-1)} unread={unread(c.id)} active={c.id === active} onClick={() => open(c.id)} />)}
              {sorted.pairs.filter(match).length > 0 && <div className="wa-sep"><Eye size={12} /> Cosa si dicono tra loro</div>}
              {sorted.pairs.filter(match).map(c => <ConvRow key={c.id} c={c} last={byConv.get(c.id)?.at(-1)} unread={unread(c.id)} active={c.id === active} onClick={() => open(c.id)} />)}
            </div>
          </aside>

          <section className="wa-chat">
            <header className="wa-chat-head">
              <button className="wa-back" onClick={() => setMobileChat(false)} aria-label="Indietro"><ArrowLeft size={20} /></button>
              <Avatar color={cur.color} label={abbr(cur.title)} size={40} />
              <div><b>{cur.title}</b><span>{cur.subtitle}</span></div>
            </header>
            <Thread messages={thread} conv={cur} />
            {cur.readOnly
              ? <div className="wa-readonly"><Eye size={14} /> Stai solo guardando: questa conversazione è tra due agenti.</div>
              : <Composer onText={t => send({ text: t })} onClip={a => send({ audio: a })} onError={setError} placeholder={cur.kind === 'group' ? 'Scrivi al gruppo' : `Scrivi a ${cur.title}`} />}
          </section>
        </div>
      )}
    </div>
  );
};

const ConvRow: FC<{ c: ConvInfo; last?: ChatMessage; unread: number; active: boolean; onClick: () => void }> = ({ c, last, unread, active, onClick }) => (
  <button className={`wa-conv${active ? ' on' : ''}`} onClick={onClick}>
    <Avatar color={c.color} label={abbr(c.title)} />
    <span className="wa-conv-main">
      <span className="wa-conv-top"><b>{c.title}</b>{last && <time className={unread ? 'new' : ''}>{listTime(last.createdAt)}</time>}</span>
      <span className="wa-conv-bot">
        <span className="wa-prev">{last ? <>{c.kind !== 'dm' && <em>{infoOf(last.from).name}: </em>}{previewOf(last)}</> : <i>Nessun messaggio</i>}</span>
        {unread > 0 && <span className="wa-badge">{unread}</span>}
      </span>
    </span>
  </button>
);

const Thread = ({ messages, conv }: { messages: ChatMessage[]; conv: ConvInfo }) => {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, conv.id]);
  let lastDay = '';
  return (
    <div className="wa-thread">
      {messages.length === 0 && <div className="wa-empty">Nessun messaggio. {conv.readOnly ? 'Appariranno quando gli agenti si scrivono.' : 'Scrivi qualcosa o registra un vocale.'}</div>}
      {messages.map(m => {
        const mine = m.from === OWNER_ID;
        const who = infoOf(m.from);
        const day = dayLabel(m.createdAt);
        const header = day !== lastDay ? <div className="wa-day"><span>{day}</span></div> : null;
        lastDay = day;
        return (
          <div key={m.id}>
            {header}
            <div className={`wa-msg ${mine ? 'out' : 'in'}`}>
              <div className="wa-bubble">
                {!mine && conv.kind !== 'dm' && <div className="wa-who" style={{ color: who.color }}>{who.name}</div>}
                {conv.kind === 'pair' && <div className="wa-to">→ {infoOf(m.to).name}</div>}
                {m.audio && <VoiceBubble clip={m.audio} seed={m.id} color={mine ? '#53bdeb' : who.color} />}
                {m.text && <div className="wa-text">{m.text}</div>}
                <time>{hhmm(m.createdAt)}</time>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
};

// Riconoscimento vocale del browser (Chrome, Edge, Safari): trascrive mentre si parla
const SpeechRec: any = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

const Composer = ({ onText, onClip, onError, placeholder }: { onText: (t: string) => void; onClip: (a: AudioClip) => Promise<void> | void; onError: (m: string) => void; placeholder: string }) => {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef<any>(null);
  const base = useRef('');
  useEffect(() => () => { try { rec.current?.stop(); } catch { /* già fermo */ } }, []);

  const submit = () => {
    const t = text.trim(); if (!t) return;
    try { rec.current?.stop(); } catch { /* già fermo */ }
    onText(t.slice(0, 4000)); setText('');
  };

  // Tocca per dettare, tocca di nuovo per fermare: il testo resta nella casella, modificabile, e si invia con il pulsante
  const dictate = () => {
    if (listening) { try { rec.current?.stop(); } catch { /* già fermo */ } return; }
    const r = new SpeechRec();
    r.lang = 'it-IT'; r.continuous = true; r.interimResults = true;
    base.current = text ? text.trimEnd() + ' ' : '';
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText((base.current + t).slice(0, 4000));
    };
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError('Microfono non consentito: autorizza il microfono nelle impostazioni del browser.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') onError('Dettatura non riuscita (' + e.error + ').');
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  };

  return (
    <div className="wa-composer">
      <textarea rows={1} value={text} placeholder={listening ? 'Sto ascoltando… parla' : placeholder} maxLength={4000}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
      {SpeechRec
        ? <button className={`wa-round${listening ? ' wa-listening' : ''}`} onClick={dictate} aria-label={listening ? 'Ferma la dettatura' : 'Detta a voce'} title={listening ? 'Ferma' : 'Detta a voce'}><Mic size={20} /></button>
        : !text.trim() && <Recorder onClip={onClip} onError={onError} />}
      {text.trim() && <button className="wa-round wa-send" onClick={submit} aria-label="Invia"><Send size={19} /></button>}
    </div>
  );
};
