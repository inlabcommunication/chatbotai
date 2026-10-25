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

// Raffica: se l'agente è stato appena svegliato, il nuovo messaggio non lo sveglia di nuovo
const BURST_MS = 15_000;
// Doppio invio dello stesso testo: non costa una seconda sveglia
const DUPLICATE_MS = 60_000;

/** `force`: "Riprova" dell'utente, salta le regole che risparmiano sveglie. */
export async function wakeForMessage(db: Firestore, id: string, force = false): Promise<Record<string, WakeResult>> {
  const ref = db.collection("agent_messages").doc(id);
  const snap = await ref.get();
  const m: any = snap.data();
  const out: Record<string, WakeResult> = {};
  if (!m || m.from !== "owner") return out;

  const targets = targetsFor(m.to);
  if (!targets.length) {
    out[m.to] = { status: "skipped", reason: "nessun agente da svegliare (per il gruppo imposta AGENT_GROUP_WAKE)", at: new Date().toISOString() };
  }
  const voiceOnly = !!m.audio && !m.text;
  // ultimi messaggi, per riconoscere ripetizioni e raffiche (si filtra qui: niente indice composto)
  const recent: any[] = force || voiceOnly ? [] : (await db.collection("agent_messages").orderBy("createdAt", "desc").limit(30).get())
    .docs.filter(d => d.id !== id).map(d => d.data());
  for (const agent of targets) {
    const done = (r: Omit<WakeResult, "at">) => { out[agent] = { ...r, at: new Date().toISOString() }; };
    if (voiceOnly && !force) { done({ status: "skipped", reason: "vocale: gli agenti non lo ascoltano, nessuna sveglia (usa la dettatura)" }); continue; }
    if (!force) {
      const prev = recent.find(x => x.from === "owner" && x.to === m.to && x.wake?.[agent]?.status === "sent");
      const sinceWake = prev ? Date.now() - Date.parse(prev.wake[agent].at) : Infinity;
      if (prev && prev.text && prev.text === m.text && sinceWake < DUPLICATE_MS) { done({ status: "skipped", reason: "stesso testo appena inviato: nessuna seconda sveglia" }); continue; }
      if (prev && sinceWake < BURST_MS) { done({ status: "skipped", reason: "agente appena svegliato: leggerà tutti i messaggi non letti insieme" }); continue; }
    }
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
