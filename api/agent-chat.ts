/**
 * Vercel Serverless Function: /api/agent-chat
 * Canale con cui gli agenti (sessioni Claude) scrivono nella chat della dashboard e
 * leggono i messaggi del titolare. Protetto da un segreto condiviso (AGENT_CHAT_TOKEN).
 *
 *  POST  { agent, to, text }            → l'agente `agent` scrive a `to` ('owner' | 'group' | altro agente)
 *  GET   ?agent=seo&unread=1            → messaggi rivolti a `agent` (privati e di gruppo) che non ha ancora letto
 *  GET   ?agent=seo&attachment=<id messaggio> → scarica l'allegato del messaggio: {name, mime, b64}
 *  GET   ?agent=seo&since=ISO&limit=50  → oppure quelli successivi alla data `since`
 *        &history=N                     → `history`: gli ultimi N (default 40, max 100, 0 = nessuno) messaggi delle sue conversazioni, come contesto
 *        &from=ISO&to=ISO&q=parola      → cerca nel passato (intervallo di date e/o parola) invece degli ultimi N
 */
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { FieldValue } from "firebase-admin/firestore";
import { wakeForMessage } from "./_lib/wake";
import { pushForMessage } from "./_lib/push";
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
      // Un messaggio a un collega, o nel gruppo con @collega, sveglia quel collega (con tetto sulla catena)
      const wake = await wakeForMessage(db, doc.id);
      // Notifica push al titolare se l'agente gli scrive (privato o gruppo); l'esito resta sul messaggio
      const push = await pushForMessage(db, doc.id).catch(() => null);
      return res.status(200).json({ ok: true, id: doc.id, wake, ...(push ? { push } : {}) });
    }

    if (req.method === "GET" && req.query.attachment) {
      // Allegato di un messaggio: solo il destinatario (o il mittente) lo scarica. Risposta: {name, mime, b64}
      const agent = str(String(req.query.agent || ""), 30);
      if (!AGENTS.includes(agent)) return res.status(400).json({ error: "Agente sconosciuto" });
      const msg: any = (await db.collection("agent_messages").doc(str(String(req.query.attachment), 40)).get()).data();
      if (!msg?.file || !(msg.from === agent || msg.to === agent || msg.to === "group")) return res.status(404).json({ error: "Allegato non trovato" });
      const f: any = (await db.collection("agent_files").doc(msg.file.id).get()).data();
      if (!f) return res.status(404).json({ error: "Allegato non trovato" });
      return res.status(200).json({ name: f.name, mime: f.mime, b64: f.b64 });
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
      // Contesto: i messaggi delle conversazioni dell'agente (con il titolare, nel gruppo, con altri agenti), già letti o no,
      // senza duplicare i non letti e senza segnarli come letti. Di default gli ultimi 40; con from/to (date ISO) e/o q (parola)
      // si cerca nel passato: tutto è salvato nel database.
      const histRaw = req.query.history === undefined ? 40 : Number(req.query.history);
      const histN = Math.min(100, Math.max(0, Number.isFinite(histRaw) ? histRaw : 40));
      const fromQ = str(String(req.query.from || ""), 40), toQ = str(String(req.query.to || ""), 40);
      const q = str(String(req.query.q || ""), 80).toLowerCase();
      let history: any[] = [];
      if (histN) {
        const ids = new Set(docs.map((m: any) => m.id));
        let col: any = db.collection("agent_messages");
        if (fromQ) col = col.where("createdAt", ">=", fromQ);
        if (toQ) col = col.where("createdAt", "<", toQ);
        const snap = await col.orderBy("createdAt", "desc").limit(fromQ || toQ || q ? 1000 : 300).get();
        history = snap.docs.map((d: any): any => ({ id: d.id, ...d.data() }))
          .filter((m: any) => !ids.has(m.id) && (m.from === agent || m.to === agent || m.to === "group")
            && (!q || String(m.text || "").toLowerCase().includes(q)))
          .slice(0, histN).reverse()
          .map((m: any) => ({ id: m.id, from: m.from, to: m.to, createdAt: m.createdAt, text: m.text || "", voice: m.audio ? { seconds: m.audio.sec } : undefined, file: m.file ? { name: m.file.name, mime: m.file.mime, size: m.file.size } : undefined }));
      }
      const messages = docs.map((m: any) => ({ id: m.id, from: m.from, to: m.to, createdAt: m.createdAt, text: m.text || "", voice: m.audio ? { seconds: m.audio.sec } : undefined, file: m.file ? { name: m.file.name, mime: m.file.mime, size: m.file.size } : undefined }));
      return res.status(200).json(histN ? {
        note: "messages = messaggi nuovi a cui rispondere. history = ultimi messaggi già scambiati (con il titolare, nel gruppo, con altri agenti): serve a capire il contesto, non risponderci. Tu parti da una sessione nuova a ogni sveglia e non ricordi le conversazioni precedenti, ma tutte le chat sono salvate: se ti chiedono di un discorso di giorni fa e non è in history, cerca nel passato con gli stessi comandi aggiungendo &from=DATA_ISO&to=DATA_ISO (intervallo) e/o &q=PAROLA.",
        messages, history,
      } : { messages });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("Agent chat error:", e);
    return res.status(500).json({ error: "Errore interno" });
  }
}
