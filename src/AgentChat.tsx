import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowLeft, Mic, Paperclip, Send, X, Network, MessageCircle, Search, Eye, Sparkles } from 'lucide-react';
import { auth, db } from './firebase';
import {
  AGENTS, GROUP_ID, OWNER_ID, convInfo, demoMessages, infoOf, previewOf, shortOf,
  type AudioClip, type ChatMessage, type ConvInfo,
} from './agentChat/model';
import { Recorder, VoiceBubble } from './agentChat/Voice';
import { InteractionMap } from './agentChat/InteractionMap';
import { NotifyButton } from './agentChat/Notify';
import { ACCEPT, FileBubble, fmtSize, prepareFile, type PendingFile } from './agentChat/Attach';
import { agentChatStyles } from './agentChat/styles';

const COLLECTION = 'agent_messages';
const SEEN_KEY = 'agentchat_seen';

const loadSeen = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
const saveSeen = (s: Record<string, string>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* storage non disponibile */ } };

type WakeInfo = NonNullable<ChatMessage['wake']>;

async function callApi(path: string, body: unknown): Promise<{ ok: boolean; wake?: WakeInfo; error?: string }> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) return { ok: false, error: 'Sessione scaduta: esci e rientra.' };
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, wake: j.wake } : { ok: false, error: j.error || `Errore ${r.status}` };
  } catch { return { ok: false, error: 'Connessione assente.' }; }
}

/** Avvisi da segnalare: la sveglia è fallita o mancano le variabili su Vercel (non i casi "saltata di proposito"). */
const wakeProblems = (w?: WakeInfo): string[] =>
  Object.entries(w ?? {}).filter(([, r]) => r.status === 'failed' || r.reason?.startsWith('variabili') || r.reason?.startsWith('nessun agente'))
    .map(([a, r]) => `${infoOf(a).name}: ${r.reason}`);

/** Spunte come WhatsApp: una = salvato, due blu = letto da un agente (scaricato con l'API). */
const Ticks = ({ m }: { m: ChatMessage }) => {
  const readers = m.readBy ?? [];
  const read = readers.length > 0;
  const who = readers.map(r => infoOf(r).name).join(', ');
  const wake = Object.entries(m.wake ?? {}).map(([a, r]) => `${infoOf(a).name}: avviso ${r.status === 'sent' ? 'inviato' : r.status === 'failed' ? 'fallito' : 'non inviato'}${r.reason ? ' (' + r.reason + ')' : ''}`).join('\n');
  const label = (read ? `Letto da ${who}` : 'Inviato') + (wake ? '\n' + wake : '');
  return (
    <svg className="wa-ticks" width="18" height="12" viewBox="0 0 18 12" role="img" aria-label={label}>
      <title>{label}</title>
      <g fill="none" stroke={read ? '#53bdeb' : 'rgba(233,237,239,.6)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 6.5l3.2 3.2L11 2.5" />
        {read && <path d="M7.2 9.7l.7.7L14.5 2.5" />}
      </g>
    </svg>
  );
};

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

  // Tocco su una notifica: apre la conversazione giusta (indirizzo ?conv=... oppure messaggio dal service worker)
  useEffect(() => {
    const valid = (c: string) => /^(group|dm_[a-z]+|pair_[a-z]+_[a-z]+)$/.test(c);
    const open = (c: string) => { if (valid(c)) { setActive(c); setMobileChat(true); setView('chat'); } };
    const q = new URLSearchParams(window.location.search).get('conv');
    if (q) { open(q); window.history.replaceState(null, '', window.location.pathname); }
    const h = (e: MessageEvent) => { if (e.data?.type === 'open-conv') open(String(e.data.conv || '')); };
    navigator.serviceWorker?.addEventListener('message', h);
    return () => navigator.serviceWorker?.removeEventListener('message', h);
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

  const send = async (payload: { text?: string; audio?: AudioClip; file?: PendingFile }) => {
    if (!db || demo) { setError(demo ? 'Anteprima dimostrativa: esci dalla demo per inviare messaggi veri.' : 'Database non configurato.'); return; }
    const to = cur.kind === 'group' ? GROUP_ID : cur.members.find(m => m !== OWNER_ID)!;
    // Il server salva il messaggio e sveglia l'agente nella stessa chiamata, poi dice com'è andata
    const r = await callApi('/api/send', { to, ...payload });
    if (!r.ok) { setError(`Messaggio non inviato: ${r.error}`); return; }
    const problems = wakeProblems(r.wake);
    setError(problems.length ? `Messaggio salvato, ma agente non avvisato. ${problems.join(' · ')}` : null);
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
            <div className="wa-list-head">Chat degli agenti<span className="wa-head-actions"><NotifyButton onMessage={setError} />{onLogout && <button onClick={onLogout} className="wa-exit">Esci</button>}</span></div>
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
            <Thread messages={thread} conv={cur} onRetry={async id => { const r = await callApi('/api/notify-agent', { id }); const p = r.ok ? wakeProblems(r.wake) : [r.error || 'Errore']; setError(p.length ? `Avviso non riuscito. ${p.join(' · ')}` : null); }} />
            {cur.readOnly
              ? <div className="wa-readonly"><Eye size={14} /> Stai solo guardando: questa conversazione è tra due agenti.</div>
              : <Composer onText={(t, f) => send({ text: t || undefined, file: f })} onClip={a => send({ audio: a })} onError={setError} placeholder={cur.kind === 'group' ? 'Scrivi al gruppo (@seo per chiamare un agente)' : `Scrivi a ${cur.title}`} />}
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

const Thread = ({ messages, conv, onRetry }: { messages: ChatMessage[]; conv: ConvInfo; onRetry: (id: string) => void }) => {
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
                {m.file && <FileBubble f={m.file} />}
                {m.audio && <VoiceBubble clip={m.audio} seed={m.id} color={mine ? '#53bdeb' : who.color} />}
                {m.text && <div className="wa-text">{m.text}</div>}
                {mine && wakeProblems(m.wake).length > 0 && (
                  <div className="wa-wakeerr">⚠ Agente non avvisato: {wakeProblems(m.wake).join(' · ')} <button onClick={() => onRetry(m.id)}>Riprova</button></div>
                )}
                <time title={!mine && m.push ? (m.push.status === 'sent' ? `Notifica inviata a ${m.push.sent} dispositivi` : `Notifica non inviata: ${m.push.reason || 'errore'}`) : undefined}>{hhmm(m.createdAt)}{mine && <Ticks m={m} />}</time>
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

const Composer = ({ onText, onClip, onError, placeholder }: { onText: (t: string, f?: PendingFile) => void; onClip: (a: AudioClip) => Promise<void> | void; onError: (m: string) => void; placeholder: string }) => {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [file, setFile] = useState<PendingFile | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const rec = useRef<any>(null);
  const base = useRef('');
  useEffect(() => () => { try { rec.current?.stop(); } catch { /* già fermo */ } }, []);

  const submit = () => {
    const t = text.trim(); if (!t && !file) return;
    try { rec.current?.stop(); } catch { /* già fermo */ }
    onText(t.slice(0, 4000), file ?? undefined); setText(''); setFile(null);
  };

  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await prepareFile(f);
      if (typeof r === 'string') onError(r); else setFile(r);
    } catch { onError('File non leggibile.'); }
    setBusy(false);
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
    <div className="wa-composer-wrap">
      {file && (
        <div className="wa-chip">
          <Paperclip size={14} /><span>{file.name} · {fmtSize(file.size)}</span>
          <button onClick={() => setFile(null)} aria-label="Togli l'allegato"><X size={14} /></button>
        </div>
      )}
    <div className="wa-composer">
      <input ref={picker} type="file" accept={ACCEPT} hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <button className="wa-round" onClick={() => picker.current?.click()} disabled={busy} aria-label="Allega un file" title="Allega un file"><Paperclip size={20} /></button>
      <textarea rows={1} value={text} placeholder={listening ? 'Sto ascoltando… parla' : placeholder} maxLength={4000}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
      {SpeechRec
        ? <button className={`wa-round${listening ? ' wa-listening' : ''}`} onClick={dictate} aria-label={listening ? 'Ferma la dettatura' : 'Detta a voce'} title={listening ? 'Ferma' : 'Detta a voce'}><Mic size={20} /></button>
        : !text.trim() && !file && <Recorder onClip={onClip} onError={onError} />}
      {(text.trim() || file) && <button className="wa-round wa-send" onClick={submit} aria-label="Invia"><Send size={19} /></button>}
    </div>
    </div>
  );
};
