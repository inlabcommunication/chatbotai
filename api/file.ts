/**
 * Vercel Serverless Function: /api/file?id=<id allegato>
 * Restituisce un allegato della chat (nome, tipo, contenuto in base64) al titolare loggato.
 */
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { getAdminDb, requireAdmin, securityHeaders, str } from "./_lib/security";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "Non autorizzato" });
  const id = str(String(req.query.id || ""), 40);
  if (!id) return res.status(400).json({ error: "Allegato mancante" });
  try {
    const snap = await getAdminDb().collection("agent_files").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "Allegato non trovato" });
    const d: any = snap.data();
    return res.status(200).json({ name: d.name, mime: d.mime, b64: d.b64 });
  } catch (e) {
    console.error("File error:", e);
    return res.status(500).json({ error: "Errore interno" });
  }
}
