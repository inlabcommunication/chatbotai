import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Mic, Send, Trash2 } from 'lucide-react';
import { fmtSec, type AudioClip } from './model';

export const MAX_RECORD_SEC = 120;
/** Limite di sicurezza: un documento Firestore non può superare 1 MB. */
export const MAX_AUDIO_B64 = 700_000;

// Il CSP del sito non ammette data: nei media: si decodifica in un Blob locale.
function clipToUrl(clip: AudioClip): string {
  const bin = atob(clip.b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: clip.mime }));
}

// Barre della "forma d'onda": decorative ma stabili per lo stesso messaggio
function bars(seed: string, n = 28): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: n }, () => { h = Math.imul(h ^ (h >>> 13), 1274126177); return 20 + (Math.abs(h) % 80); });
}

export const VoiceBubble = ({ clip, seed, color }: { clip: AudioClip; seed: string; color: string }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const heights = useMemo(() => bars(seed), [seed]);

  useEffect(() => {
    let u: string | null = null;
    try { u = clipToUrl(clip); setUrl(u); } catch { setUrl(null); }
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [clip]);

  const toggle = () => {
    const a = ref.current; if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };
  const dur = clip.sec || 1;
  const progress = Math.min(1, pos / dur);

  return (
    <div className="wa-voice">
      {url && (
        <audio ref={ref} src={url} preload="metadata"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setPos(0); }}
          onTimeUpdate={e => setPos(e.currentTarget.currentTime)} />
      )}
      <button className="wa-voice-btn" onClick={toggle} disabled={!url} aria-label={playing ? 'Pausa' : 'Riproduci'} style={{ color }}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <div className="wa-wave"
        onClick={e => {
          const a = ref.current; if (!a) return;
          const r = e.currentTarget.getBoundingClientRect();
          a.currentTime = ((e.clientX - r.left) / r.width) * dur;
        }}>
        {heights.map((h, i) => (
          <i key={i} style={{ height: `${h}%`, background: i / heights.length <= progress ? color : 'rgba(255,255,255,.28)' }} />
        ))}
      </div>
      <span className="wa-voice-t">{fmtSec(playing || pos > 0 ? pos : dur)}</span>
    </div>
  );
};

function pickMime(): string {
  const prefs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return prefs.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';
}

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Barra di registrazione: avvia al clic sul microfono, poi invia o annulla. */
export const Recorder = ({ onClip, onError }: { onClip: (c: AudioClip) => Promise<void> | void; onError: (m: string) => void }) => {
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const started = useRef(0);
  const cancelled = useRef(false);

  const cleanup = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
  };
  useEffect(() => () => { cancelled.current = true; try { mr.current?.stop(); } catch { /* già fermo */ } cleanup(); }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Questo browser non supporta la registrazione audio.'); return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('Microfono non disponibile: consenti l\'accesso al microfono nel browser.'); return;
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
    chunks.current = []; cancelled.current = false;
    r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = async () => {
      const type = r.mimeType || mime || 'audio/webm';
      const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      cleanup(); setRec(false);
      if (cancelled.current || !chunks.current.length) return;
      setBusy(true);
      try {
        const b64 = await blobToB64(new Blob(chunks.current, { type }));
        if (b64.length > MAX_AUDIO_B64) onError('Vocale troppo lungo: registra un messaggio più breve.');
        else await onClip({ b64, mime: type.split(';')[0], sec: seconds });
      } catch { onError('Invio del vocale non riuscito.'); }
      setBusy(false);
    };
    mr.current = r; started.current = Date.now(); setSec(0); setRec(true); r.start();
    timer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSec(s);
      if (s >= MAX_RECORD_SEC) r.stop();
    }, 250);
  };
  const stop = (send: boolean) => { cancelled.current = !send; try { mr.current?.stop(); } catch { cleanup(); setRec(false); } };

  if (!rec) {
    return (
      <button className="wa-round" onClick={start} disabled={busy} aria-label="Registra un vocale" title="Registra un vocale">
        <Mic size={20} />
      </button>
    );
  }
  return (
    <div className="wa-rec">
      <button className="wa-round wa-danger" onClick={() => stop(false)} aria-label="Annulla"><Trash2 size={18} /></button>
      <span className="wa-rec-dot" /><span className="wa-rec-t">{fmtSec(sec)}</span>
      <span className="wa-rec-hint">Registrazione…</span>
      <button className="wa-round wa-send" onClick={() => stop(true)} aria-label="Invia vocale"><Send size={18} /></button>
    </div>
  );
};
