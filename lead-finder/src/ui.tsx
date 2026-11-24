import type { ReactNode } from 'react';
import { opportunity, type Lead } from './model';

export function Score({ lead, size = 40 }: { lead: Lead; size?: number }) {
  const s = opportunity(lead).score;
  const c = s >= 70 ? 'var(--acc)' : s >= 40 ? 'var(--warn)' : 'var(--mut)';
  return <div className="ring" style={{ width: size, height: size, borderColor: c, color: c }} title="Opportunità: quanto è facile proporgli qualcosa">{s}</div>;
}
export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return <div className="empty"><div style={{ fontSize: 38 }}>{icon}</div><h3>{title}</h3><div className="muted">{children}</div></div>;
}
export function Issues({ items }: { items: { severity: 'alta' | 'media' | 'bassa'; problem: string; proposal: string }[] }) {
  if (!items.length) return <p>✅ Nessun problema evidente.</p>;
  return <>{items.map((i, k) => <p key={k} className="issue"><b className={i.severity}>● {i.problem}</b><br /><span className="muted">→ {i.proposal}</span></p>)}</>;
}
export const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
