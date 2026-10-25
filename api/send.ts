/**
 * Vercel Serverless Function: /api/send
 * Il titolare (loggato) manda un messaggio: il server lo salva e, nella stessa chiamata, sveglia
 * l'agente destinatario. Risponde con l'esito della sveglia, così l'app può dire se l'agente è stato avvisato.
 */
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { getAdminDb, rateLimit, requireAdmin, securityHeaders, str } from "./_lib/security";
import { AGENTS, wakeForMessage } from "./_lib/wake";

const MAX_AUDIO_B64 = 700_000;

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
  if (!text === !audio) return res.status(400).json({ error: "Serve un testo oppure un vocale" });

  try {
    const db = getAdminDb();
    if (!(await rateLimit(db, "send", "owner", 300, 3600))) return res.status(429).json({ error: "Troppi messaggi" });
    const ref = await db.collection("agent_messages").add({
      from: "owner", to, conv: to === "group" ? "group" : `dm_${to}`,
      ...(text ? { text } : { audio }), createdAt: new Date().toISOString(),
    });
    const wake = await wakeForMessage(db, ref.id);
    return res.status(200).json({ ok: true, id: ref.id, wake });
  } catch (e) {
    console.error("Send error:", e);
    return res.status(500).json({ error: "Errore interno" });
  }
}
