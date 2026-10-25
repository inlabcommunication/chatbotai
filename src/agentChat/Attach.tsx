import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { auth } from '../firebase';

export interface PendingFile { name: string; mime: string; b64: string; size: number }

/** Limite del contenuto codificato: un documento Firestore non può superare 1 MB. */
const MAX_B64 = 680_000;
const OK_MIMES = new Set([
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
export const ACCEPT = 'image/*,.pdf,.txt,.csv,.md,.json,.docx,.xlsx';

const readB64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Le foto vengono ridotte (lato lungo 1600 px, JPEG) finché stanno nel limite. */
async function shrinkImage(file: File): Promise<{ b64: string; mime: string } | null> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  let side = 1600;
  for (let i = 0; i < 6; i++) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/jpeg', i < 3 ? 0.82 : 0.65));
    if (blob) { const b64 = await readB64(blob); if (b64.length <= MAX_B64) return { b64, mime: 'image/jpeg' }; }
    side = Math.round(side * 0.75);
  }
  return null;
}

/** Prepara un file scelto dall'utente; ritorna l'allegato oppure il motivo per cui non va bene. */
export async function prepareFile(file: File): Promise<PendingFile | string> {
  const name = file.name.replace(/[\\/]/g, '_').slice(0, 120) || 'allegato';
  if (file.type.startsWith('image/')) {
    const img = await shrinkImage(file);
    if (!img) return 'Immagine troppo grande o non leggibile.';
    return { name: name.replace(/\.[^.]+$/, '') + '.jpg', mime: img.mime, b64: img.b64, size: Math.floor(img.b64.length * 3 / 4) };
  }
  const mime = file.type || (name.endsWith('.md') ? 'text/markdown' : '');
  if (!OK_MIMES.has(mime)) return 'Tipo di file non ammesso (immagini, PDF, testo, CSV, JSON, Word, Excel).';
  const b64 = await readB64(file);
  if (b64.length > MAX_B64) return 'File troppo grande: il massimo è circa 500 KB.';
  return { name, mime, b64, size: file.size };
}

export const fmtSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

// Gli allegati si scaricano al bisogno (non stanno nella lista dei messaggi) e si tengono in memoria
const cache = new Map<string, Promise<string | null>>();
function fileUrl(id: string, mime: string): Promise<string | null> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return null;
      const r = await fetch('/api/file?id=' + encodeURIComponent(id), { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      const j = await r.json();
      const bin = atob(j.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: j.mime || mime }));
    })().catch(() => null);
    p.then(u => { if (!u) cache.delete(id); });
    cache.set(id, p);
  }
  return p;
}

export const FileBubble = ({ f }: { f: { id: string; name: string; mime: string; size: number } }) => {
  const isImg = f.mime.startsWith('image/');
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isImg) return;
    let alive = true;
    fileUrl(f.id, f.mime).then(u => { if (!alive) return; if (u) setUrl(u); else setFailed(true); });
    return () => { alive = false; };
  }, [f.id, f.mime, isImg]);

  if (isImg) {
    return url
      ? <a href={url} target="_blank" rel="noreferrer" className="wa-img"><img src={url} alt={f.name} /></a>
      : <div className="wa-file wa-muted">{failed ? 'Immagine non disponibile' : 'Carico l\'immagine…'}</div>;
  }
  const download = async () => {
    const u = await fileUrl(f.id, f.mime);
    if (!u) return;
    const a = document.createElement('a'); a.href = u; a.download = f.name; a.click();
  };
  return (
    <button className="wa-file" onClick={download} title="Scarica">
      <FileText size={26} />
      <span><b>{f.name}</b><i>{fmtSize(f.size)}</i></span>
      <Download size={18} />
    </button>
  );
};
