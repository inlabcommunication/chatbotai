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

/**
 * Agenti da svegliare per un messaggio scritto da un AGENTE: se scrive a un collega, quel collega;
 * se scrive nel gruppo, solo i colleghi chiamati per nome con @id (non tutto il gruppo: costerebbe troppo).
 */
export function agentTargetsFor(from: string, to: string, text: string): string[] {
  if (to === "owner") return [];
  if (to === "group") return AGENTS.filter(a => a !== from && new RegExp(`@${a}\\b`, "i").test(text || ""));
  return AGENTS.includes(to) && to !== from ? [to] : [];
}

// Massimo di messaggi di agenti di fila, senza un messaggio del titolare in mezzo, che possono ancora svegliare qualcuno
const CHAIN_MAX = Math.max(1, Number(process.env.AGENT_CHAIN_MAX) || 8);

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
  if (!m) return out;
  const fromOwner = m.from === "owner";
  if (!fromOwner && !AGENTS.includes(m.from)) return out;

  const targets = fromOwner ? targetsFor(m.to) : agentTargetsFor(m.from, m.to, m.text || "");
  if (!targets.length && fromOwner) {
    out[m.to] = { status: "skipped", reason: "nessun agente da svegliare (per il gruppo imposta AGENT_GROUP_WAKE)", at: new Date().toISOString() };
  }
  const voiceOnly = fromOwner && !!m.audio && !m.text;
  // ultimi messaggi, per riconoscere ripetizioni, raffiche e catene (si filtra qui: niente indice composto)
  const recent: any[] = force || voiceOnly || !targets.length ? [] : (await db.collection("agent_messages").orderBy("createdAt", "desc").limit(40).get())
    .docs.filter(d => d.id !== id).map(d => d.data());
  // Catena tra agenti: messaggi di agenti di fila dopo l'ultimo del titolare (compreso questo)
  let chain = 1;
  if (!fromOwner) for (const x of recent) { if (x.from === "owner") break; chain++; }
  const chainBlocked = !fromOwner && !force && chain > CHAIN_MAX;
  for (const agent of targets) {
    const done = (r: Omit<WakeResult, "at">) => { out[agent] = { ...r, at: new Date().toISOString() }; };
    if (chainBlocked) { done({ status: "skipped", reason: `catena tra agenti troppo lunga (oltre ${CHAIN_MAX} messaggi senza il titolare): nessuna sveglia, scrivi tu per farli ripartire` }); continue; }
    if (voiceOnly && !force) { done({ status: "skipped", reason: "vocale: gli agenti non lo ascoltano, nessuna sveglia (usa la dettatura)" }); continue; }
    if (!force) {
      const prev = fromOwner
        ? recent.find(x => x.from === "owner" && x.to === m.to && x.wake?.[agent]?.status === "sent")
        : recent.find(x => x.wake?.[agent]?.status === "sent");
      const sinceWake = prev ? Date.now() - Date.parse(prev.wake[agent].at) : Infinity;
      if (fromOwner && prev && prev.text && prev.text === m.text && sinceWake < DUPLICATE_MS) { done({ status: "skipped", reason: "stesso testo appena inviato: nessuna seconda sveglia" }); continue; }
      if (prev && sinceWake < BURST_MS) { done({ status: "skipped", reason: "agente appena svegliato: leggerà tutti i messaggi non letti insieme" }); continue; }
    }
    const url = process.env[`AGENT_WAKE_${agent.toUpperCase()}_URL`] || process.env.AGENT_WAKE_URL || "";
    const token = process.env[`AGENT_WAKE_${agent.toUpperCase()}_TOKEN`] || process.env.AGENT_WAKE_TOKEN || "";
    if (!url.startsWith(FIRE_PREFIX) || !token) { done({ status: "skipped", reason: "variabili AGENT_WAKE_* mancanti o non valide su Vercel" }); continue; }
    // tetto di sicurezza: al massimo 30 sveglie l'ora per agente (ogni sveglia consuma crediti)
    if (!(await rateLimit(db, "wake", agent, 30, 3600))) { done({ status: "skipped", reason: "limite di 30 sveglie l'ora raggiunto" }); continue; }
    try {
      // Il testo non contiene il messaggio: l'agente lo legge con l'API della chat (autenticata)
      const text = fromOwner
        ? `Chat InLab. Agente destinatario: ${agent}. Nuovo messaggio ${m.audio && !m.text ? "vocale " : ""}${m.file ? "con allegato " : ""}del titolare${m.to === "group" ? " nel gruppo" : " per questo agente"} (id ${id}). Leggi i messaggi non letti con l'API della chat e rispondi.`
        : `Chat InLab. Agente destinatario: ${agent}. Nuovo messaggio del collega ${m.from}${m.to === "group" ? " nel gruppo (ti ha chiamato con @" + agent + ")" : " per te"} (id ${id}). Leggi i messaggi non letti con l'API della chat e rispondi solo se serve.`;
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
