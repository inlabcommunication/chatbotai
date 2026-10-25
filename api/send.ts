/**
 * Vercel Serverless Function: /api/send
 * Il titolare (loggato) manda un messaggio: il server lo salva e, nella stessa chiamata, sveglia
 * l'agente destinatario. Risponde con l'esito della sveglia, così l'app può dire se l'agente è stato avvisato.
 */
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { getAdminDb, rateLimit, requireAdmin, securityHeaders, str } from "./_lib/security";
import { AGENTS, wakeForMessage } from "./_lib/wake";

const MAX_AUDIO_B64 = 700_000;
// Un documento Firestore può pesare 1 MB: l'allegato sta in un documento a parte, ~520 KB di file
const MAX_FILE_B64 = 700_000;
const FILE_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "text/csv", "text/markdown", "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "Non autorizzato" });

  const b = req.body || {};
  const to = str(b.to, 30);
  if (to !== "group" && !AGENTS.includes(to)) return res.status(400).json({ error: "Destinatario non valido" });
  const text = str(b.text, 4000);
  const a = b.audio;
  const audio = a && typeof a.b64 === "string" && a.b64.length <= MAX_AUDIO_B64
    ? { b64: a.b64, mime: str(a.mime, 40) || "audio/webm", sec: Number(a.sec) || 0 } : null;
  const f = b.file;
  const file = f && typeof f.b64 === "string" && f.b64.length > 0 && f.b64.length <= MAX_FILE_B64 && B64_RE.test(f.b64) && FILE_MIMES.has(String(f.mime))
    ? { b64: f.b64, mime: String(f.mime), name: str(f.name, 120).replace(/[\\/]/g, "_") || "allegato", size: Math.floor(f.b64.length * 3 / 4) } : null;
  if (f && !file) return res.status(400).json({ error: "Allegato non valido o troppo grande (massimo circa 500 KB)" });
  if (audio && file) return res.status(400).json({ error: "Un vocale e un allegato non possono stare insieme" });
  if (!text && !audio && !file) return res.status(400).json({ error: "Messaggio vuoto" });

  try {
    const db = getAdminDb();
    if (!(await rateLimit(db, "send", "owner", 300, 3600))) return res.status(429).json({ error: "Troppi messaggi" });
    const now = new Date().toISOString();
    // il contenuto dell'allegato sta in agent_files (il messaggio ne porta solo i dati): l'elenco chat resta leggero
    let fileMeta: { id: string; name: string; mime: string; size: number } | null = null;
    if (file) {
      const fd = await db.collection("agent_files").add({ b64: file.b64, mime: file.mime, name: file.name, size: file.size, createdAt: now });
      fileMeta = { id: fd.id, name: file.name, mime: file.mime, size: file.size };
    }
    const ref = await db.collection("agent_messages").add({
      from: "owner", to, conv: to === "group" ? "group" : `dm_${to}`,
      ...(text ? { text } : {}), ...(audio ? { audio } : {}), ...(fileMeta ? { file: fileMeta } : {}), createdAt: now,
    });
    const wake = await wakeForMessage(db, ref.id);
    return res.status(200).json({ ok: true, id: ref.id, wake });
  } catch (e) {
    console.error("Send error:", e);
    return res.status(500).json({ error: "Errore interno" });
  }
}
