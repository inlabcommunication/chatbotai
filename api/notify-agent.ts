/**
 * Vercel Serverless Function: /api/notify-agent
 * "Riprova avviso": il titolare (loggato) fa ripartire la sveglia per un messaggio già salvato.
 * Per ogni agente servono su Vercel AGENT_WAKE_URL e AGENT_WAKE_TOKEN (una routine per tutti) oppure
 * AGENT_WAKE_<ID>_URL e AGENT_WAKE_<ID>_TOKEN (una routine per agente); AGENT_GROUP_WAKE elenca gli
 * agenti svegliati dai messaggi al gruppo.
 */
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { getAdminDb, requireAdmin, securityHeaders, str } from "./_lib/security";
import { wakeForMessage } from "./_lib/wake";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "Non autorizzato" });
  const id = str((req.body || {}).id, 40);
  if (!id) return res.status(400).json({ error: "Messaggio mancante" });
  try {
    return res.status(200).json({ ok: true, wake: await wakeForMessage(getAdminDb(), id) });
  } catch (e) {
    console.error("Notify error:", e);
    return res.status(500).json({ error: "Errore interno" });
  }
}
