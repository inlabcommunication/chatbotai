import { lookup } from 'node:dns/promises';
import net from 'node:net';

function isPrivate(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

/** Accetta solo http(s) verso host pubblici (evita di far leggere alla funzione la rete interna). */
export async function safeUrl(input: string): Promise<URL | null> {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  try {
    const addrs = await lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return null;
  } catch { return null; }
  return u;
}
