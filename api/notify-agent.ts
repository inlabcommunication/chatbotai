/**
 * Vercel Serverless Function: /api/notify-agent
 * Chiamata dall'app dopo che il titolare scrive: sveglia la routine dell'agente destinatario
 * (indirizzo di avvio "API" della routine su claude.ai). Solo per il titolare loggato.
 *
 * Per ogni agente, due variabili su Vercel (indirizzo e token mostrati da claude.ai):
 *   AGENT_WAKE_<ID>_URL    es. AGENT_WAKE_SEO_URL    = https://api.anthropic.com/v1/claude_code/routines/trig_.../fire
 *   AGENT_WAKE_<ID>_TOKEN  es. AGENT_WAKE_SEO_TOKEN  = sk-ant-oat01-...
 * Messaggi al gruppo: svegliano solo gli agenti elencati in AGENT_GROUP_WAKE (es. "direttore").
 * Un agente senza variabili non viene svegliato e il messaggio resta comunque in chat.
 */
import type { VercelRequest, VercelResponse } from "./_lib/types";
import { getAdminDb, rateLimit, requireAdmin, securityHeaders, str } from "./_lib/security";

// Stesso elenco di src/agentChat/model.ts (le funzioni /api non importano da src/)
const AGENTS = ["sito", "direttore", "seo", "blog", "performance", "competitor", "sicurezza"];
const FIRE_PREFIX = "https://api.anthropic.com/v1/claude_code/routines/";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  securityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req))) return res.status(401).json({ error: "Non autorizzato" });

  const b = req.body || {};
  const to = str(b.to, 30), id = str(b.id, 40), voice = b.kind === "voice";
  const targets = to === "group"
    ? (process.env.AGENT_GROUP_WAKE || "").split(",").map(s => s.trim()).filter(a => AGENTS.includes(a))
    : AGENTS.includes(to) ? [to] : [];

  const woken: string[] = [], skipped: string[] = [];
  const db = getAdminDb();
  for (const agent of targets) {
    const url = process.env[`AGENT_WAKE_${agent.toUpperCase()}_URL`] || "";
    const token = process.env[`AGENT_WAKE_${agent.toUpperCase()}_TOKEN`] || "";
    if (!url.startsWith(FIRE_PREFIX) || !token) { skipped.push(`${agent}:non configurato`); continue; }
    // tetto di sicurezza: al massimo 30 sveglie l'ora per agente (ogni sveglia consuma crediti)
    if (!(await rateLimit(db, "wake", agent, 30, 3600))) { skipped.push(`${agent}:limite orario`); continue; }
    try {
      // Il testo non contiene il messaggio: l'agente lo legge con l'API della chat (autenticata)
      const text = `Chat InLab: nuovo messaggio ${voice ? "vocale " : ""}del titolare${to === "group" ? " nel gruppo" : " per te"} (id ${id}). Leggi la chat con l'API e rispondi.`;
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
      (r.ok ? woken : skipped).push(r.ok ? agent : `${agent}:errore ${r.status}`);
    } catch {
      skipped.push(`${agent}:errore di rete`);
    }
  }
  return res.status(200).json({ woken, skipped });
}
