// Notifiche push (Web Push con chiavi VAPID) al titolare quando un agente gli scrive in privato o nel gruppo.
// Chiavi su Vercel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...). Mai nel repository.
import type { Firestore } from "firebase-admin/firestore";
import webpush from "web-push";

// Stessi nomi di src/agentChat/model.ts (le funzioni /api non importano da src/)
const NAMES: Record<string, string> = {
  sito: "Sito Inlab", direttore: "Direttore Operativo", seo: "Addetto SEO", blog: "Addetto al Blog",
  performance: "Addetto performance", competitor: "Analisi competitor", sicurezza: "Analista sicurezza",
};

export interface PushResult { status: "sent" | "failed" | "skipped"; sent: number; failed: number; removed: number; reason?: string; at: string }

export function vapidReady(): boolean {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  return true;
}

/** Invia a tutti i dispositivi iscritti; toglie quelli che non esistono più. */
export async function sendToDevices(db: Firestore, payload: { title: string; body: string; conv: string }): Promise<PushResult> {
  const at = () => new Date().toISOString();
  if (!vapidReady()) return { status: "skipped", sent: 0, failed: 0, removed: 0, reason: "chiavi VAPID mancanti su Vercel", at: at() };
  const subs = await db.collection("push_subscriptions").get();
  if (subs.empty) return { status: "skipped", sent: 0, failed: 0, removed: 0, reason: "nessun dispositivo con le notifiche attive", at: at() };
  let sent = 0, failed = 0, removed = 0, reason = "";
  await Promise.all(subs.docs.map(async d => {
    try {
      await webpush.sendNotification(d.data().subscription, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) { removed++; await d.ref.delete().catch(() => {}); }
      else { failed++; reason = reason || `${e?.statusCode || "errore"} ${String(e?.body || e?.message || "").slice(0, 120)}`.trim(); }
    }
  }));
  return { status: sent ? "sent" : "failed", sent, failed, removed, ...(reason ? { reason } : {}), at: at() };
}

/** Notifica per un messaggio di un agente a "owner" o "group"; l'esito resta sul messaggio (campo `push`). */
export async function pushForMessage(db: Firestore, id: string): Promise<PushResult | null> {
  const ref = db.collection("agent_messages").doc(id);
  const m: any = (await ref.get()).data();
  if (!m || !NAMES[m.from] || (m.to !== "owner" && m.to !== "group")) return null;
  const preview = String(m.text || (m.file ? `📎 ${m.file.name}` : "Messaggio")).replace(/\s+/g, " ").slice(0, 110);
  const res = await sendToDevices(db, {
    title: m.to === "group" ? `${NAMES[m.from]} · Gruppo` : NAMES[m.from],
    body: preview,
    conv: m.to === "group" ? "group" : `dm_${m.from}`,
  });
  await ref.update({ push: res }).catch(e => console.error("push log:", e));
  return res;
}
