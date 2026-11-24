export function authHeaders(): HeadersInit {
  try { const t = localStorage.getItem('lead-finder:token'); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; }
}
export async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { headers: authHeaders() } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
  let d: unknown;
  try { d = await r.json(); } catch { throw new Error(r.status === 404 ? 'Le funzioni server non sono attive (serve il deploy su Vercel)' : `Errore ${r.status}`); }
  if (!r.ok) throw new Error((d as { error?: string }).error ?? `Errore ${r.status}`);
  return d as T;
}
export async function ai(task: 'chat' | 'outreach' | 'postcall', messages: { role: 'user' | 'assistant'; content: string }[], context: string): Promise<string> {
  return (await call<{ text: string }>('/api/ai', { task, messages, context })).text;
}
/** Esegue `fn` su tutti gli elementi con al massimo `n` richieste in parallelo. */
export async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>, onTick?: (done: number) => void) {
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; try { await fn(items[i], i); } catch { /* il singolo errore non ferma gli altri */ } onTick?.(++done); }
  }));
}
