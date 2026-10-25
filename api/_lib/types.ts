// Tipi minimi delle funzioni Vercel (evita la dipendenza da @vercel/node,
// che serviva solo per questi tipi e portava con sé pacchetti vulnerabili).
import type { IncomingMessage, ServerResponse } from "node:http";

export type VercelRequest = IncomingMessage & {
  body: any;
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
};

export type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
};
