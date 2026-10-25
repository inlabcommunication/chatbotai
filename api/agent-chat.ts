/**
 * Vercel Serverless Function: /api/agent-chat
 * Canale con cui gli agenti (sessioni Claude) scrivono nella chat della dashboard e
 * leggono i messaggi del titolare. Protetto da un segreto condiviso (AGENT_CHAT_TOKEN).
 *
 *  POST  { agent, to, text }            → l'agente `agent` scrive a `to` ('owner' | 'group' | altro agente)
 *  GET   ?agent=seo&unread=1            → messaggi rivolti a `agent` (privati e di gruppo) che non ha ancora letto
 *  GET   ?agent=seo&since=ISO&limit=50  → oppure quelli successivi alla data `since`
 */
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, rateLimit, safeEqual, securityHeaders, str } from "./_lib/security";

// Stesso elenco di src/admin/agentChat/model.ts (le funzioni /api non importano da src/)
const AGENTS = ["sito", "direttore", "seo", "blog", "performance", "competitor", "sicurezza"];

const convOf = (from: string, to: string) =>
  to === "group" ? "group" : to === "owner" ? `dm_${from}` : `pair_${[from, to].sort().join("_")}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res);
  const expected = process.env.AGENT_CHAT_TOKEN || "";
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (expected.length < 24) return res.status(503).json({ error: "AGENT_CHAT_TOKEN non configurato (almeno 24 caratteri)" });
  if (!token || !safeEqual(token, expected)) return res.status(401).json({ error: "Non autorizzato" });

  try {
    const db = getAdminDb();
    if (req.method === "POST") {
      const b = req.body || {};
      const agent = str(b.agent, 30), to = str(b.to, 30), text = str(b.text, 4000);
      if (!AGENTS.includes(agent)) return res.status(400).json({ error: "Agente sconosciuto" });
      if (!(to === "owner" || to === "group" || (AGENTS.includes(to) && to !== agent))) return res.status(400).json({ error: "Destinatario non valido" });
      if (!text) return res.status(400).json({ error: "Messaggio vuoto" });
      if (!(await rateLimit(db, "agentchat", agent, 120, 3600))) return res.status(429).json({ error: "Troppi messaggi" });
      const doc = await db.collection("agent_messages").add({
        from: agent, to, conv: convOf(agent, to), text, createdAt: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, id: doc.id });
    }

    if (req.method === "GET") {
      const agent = str(String(req.query.agent || ""), 30);
      if (!AGENTS.includes(agent)) return res.status(400).json({ error: "Agente sconosciuto" });
      const max = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const forMe = (m: any) => m.from !== agent && (m.to === agent || m.to === "group");
      let docs: any[];
      if (req.query.unread === "1") {
        // Solo i messaggi che questo agente non ha ancora letto (cronologico): niente date da ricordare, niente buchi
        const snap = await db.collection("agent_messages").orderBy("createdAt", "desc").limit(200).get();
        docs = snap.docs.map((d): any => ({ ref: d.ref, id: d.id, ...d.data() }))
          .filter((m: any) => forMe(m) && !(m.readBy || []).includes(agent)).reverse().slice(0, max);
      } else {
        const since = str(String(req.query.since || "1970-01-01T00:00:00.000Z"), 40);
        const snap = await db.collection("agent_messages").where("createdAt", ">", since).orderBy("createdAt").limit(300).get();
        docs = snap.docs.map((d): any => ({ ref: d.ref, id: d.id, ...d.data() })).filter(forMe).slice(0, max);
      }
      // Spunte doppie nella chat e "non letti": i messaggi scaricati da questo agente risultano letti
      const toMark = docs.filter((m: any) => !(m.readBy || []).includes(agent));
      if (toMark.length) {
        const batch = db.batch();
        toMark.forEach((m: any) => batch.update(m.ref, { readBy: FieldValue.arrayUnion(agent) }));
        await batch.commit().catch(() => {});
      }
      const messages = docs.map((m: any) => ({ id: m.id, from: m.from, to: m.to, createdAt: m.createdAt, text: m.text || "", voice: m.audio ? { seconds: m.audio.sec } : undefined }));
      return res.status(200).json({ messages });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("Agent chat error:", e);
    return res.status(500).json({ error: "Errore interno" });
  }
}
