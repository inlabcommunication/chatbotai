/**
 * Vercel Serverless Function: /api/push
 * Iscrizione del telefono/PC del titolare alle notifiche push.
 *  GET                         → { publicKey } (chiave pubblica VAPID, per iscriversi)
 *  POST { subscription }       → salva l'iscrizione
 *  POST { action: "test" }     → manda una notifica di prova
 *  DELETE { endpoint }         → toglie l'iscrizione
 * Solo per il titolare loggato.
 */
import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { getAdminDb, requireAdmin, securityHeaders, str } from "./_lib/security";
import { sendToDevices } from "./_lib/push";

const idOf = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 40);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res);
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "Non autorizzato" });
  try {
    const db = getAdminDb();
    if (req.method === "GET") {
      const publicKey = process.env.VAPID_PUBLIC_KEY || "";
      return publicKey ? res.status(200).json({ publicKey }) : res.status(503).json({ error: "Chiavi VAPID mancanti su Vercel" });
    }
    const b = req.body || {};
    if (req.method === "POST" && b.action === "test") {
      const r = await sendToDevices(db, { title: "Chat InLab", body: "Notifiche attive: ti avviso quando un agente ti scrive.", conv: "" });
      return res.status(200).json({ ok: r.status === "sent", result: r });
    }
    if (req.method === "POST") {
      const s = b.subscription;
      const endpoint = str(s?.endpoint, 600);
      if (!endpoint.startsWith("https://") || !s?.keys?.p256dh || !s?.keys?.auth) return res.status(400).json({ error: "Iscrizione non valida" });
      await db.collection("push_subscriptions").doc(idOf(endpoint)).set({
        subscription: { endpoint, keys: { p256dh: str(s.keys.p256dh, 200), auth: str(s.keys.auth, 100) } },
        ua: str(String(req.headers["user-agent"] || ""), 160), createdAt: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const endpoint = str(b.endpoint, 600);
      if (endpoint) await db.collection("push_subscriptions").doc(idOf(endpoint)).delete();
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("Push error:", e);
    return res.status(500).json({ error: "Errore interno" });
  }
}
