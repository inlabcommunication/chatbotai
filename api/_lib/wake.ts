// Sveglia degli agenti: chiama la routine (API trigger) dell'agente destinatario di un messaggio
// del titolare e registra l'esito sul messaggio stesso (campo `wake`), così si vede cosa è successo.
import type { Firestore } from "firebase-admin/firestore";
import { rateLimit } from "./security";

// Stesso elenco di src/agentChat/model.ts (le funzioni /api non importano da src/)
export const AGENTS = ["sito", "direttore", "seo", "blog", "performance", "competitor", "sicurezza"];
const FIRE_PREFIX = "https://api.anthropic.com/v1/claude_code/routines/";

export interface WakeResult { status: "sent" | "failed" | "skipped"; reason?: string; http?: number; at: string }

/** Agenti da svegliare per un messaggio: il destinatario, oppure quelli di AGENT_GROUP_WAKE per il gruppo. */
export function targetsFor(to: string): string[] {
  if (to === "group") return (process.env.AGENT_GROUP_WAKE || "").split(",").map(s => s.trim()).filter(a => AGENTS.includes(a));
  return AGENTS.includes(to) ? [to] : [];
}

export async function wakeForMessage(db: Firestore, id: string): Promise<Record<string, WakeResult>> {
  const ref = db.collection("agent_messages").doc(id);
  const snap = await ref.get();
  const m: any = snap.data();
  const out: Record<string, WakeResult> = {};
  if (!m || m.from !== "owner") return out;

  const targets = targetsFor(m.to);
  if (!targets.length) {
    out[m.to] = { status: "skipped", reason: "nessun agente da svegliare (per il gruppo imposta AGENT_GROUP_WAKE)", at: new Date().toISOString() };
  }
  for (const agent of targets) {
    const done = (r: Omit<WakeResult, "at">) => { out[agent] = { ...r, at: new Date().toISOString() }; };
    const url = process.env[`AGENT_WAKE_${agent.toUpperCase()}_URL`] || process.env.AGENT_WAKE_URL || "";
    const token = process.env[`AGENT_WAKE_${agent.toUpperCase()}_TOKEN`] || process.env.AGENT_WAKE_TOKEN || "";
    if (!url.startsWith(FIRE_PREFIX) || !token) { done({ status: "skipped", reason: "variabili AGENT_WAKE_* mancanti o non valide su Vercel" }); continue; }
    // tetto di sicurezza: al massimo 30 sveglie l'ora per agente (ogni sveglia consuma crediti)
    if (!(await rateLimit(db, "wake", agent, 30, 3600))) { done({ status: "skipped", reason: "limite di 30 sveglie l'ora raggiunto" }); continue; }
    try {
      // Il testo non contiene il messaggio: l'agente lo legge con l'API della chat (autenticata)
      const text = `Chat InLab. Agente destinatario: ${agent}. Nuovo messaggio ${m.audio && !m.text ? "vocale " : ""}del titolare${m.to === "group" ? " nel gruppo" : " per questo agente"} (id ${id}). Leggi i messaggi non letti con l'API della chat e rispondi.`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      done(r.ok ? { status: "sent", http: r.status } : { status: "failed", http: r.status, reason: `la routine ha risposto ${r.status}` });
    } catch {
      done({ status: "failed", reason: "errore di rete verso la routine" });
    }
  }

  const update: Record<string, WakeResult> = {};
  for (const [k, v] of Object.entries(out)) update[`wake.${k}`] = v;
  if (Object.keys(update).length) await ref.update(update).catch(e => console.error("wake log:", e));
  return out;
}
