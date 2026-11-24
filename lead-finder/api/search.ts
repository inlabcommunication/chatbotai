import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorized } from './_lib/auth.js';

/** Categoria → filtri OpenStreetMap. */
const CATEGORIES: Record<string, string[]> = {
  ristorante: ['["amenity"="restaurant"]'],
  pizzeria: ['["amenity"="restaurant"]["cuisine"~"pizza"]'],
  bar: ['["amenity"~"^(bar|cafe|pub)$"]'],
  bnb: ['["tourism"~"^(guest_house|apartment|hostel)$"]'],
  hotel: ['["tourism"="hotel"]'],
  parrucchiere: ['["shop"~"^(hairdresser|beauty)$"]'],
  dentista: ['["amenity"="dentist"]', '["healthcare"="dentist"]'],
  palestra: ['["leisure"="fitness_centre"]'],
  abbigliamento: ['["shop"="clothes"]'],
  officina: ['["shop"="car_repair"]'],
  agriturismo: ['["tourism"="guest_house"]["guest_house"="agritourism"]', '["farm"="agritourism"]'],
};

const OVERPASS = 'https://overpass-api.de/api/interpreter';

type Tags = Record<string, string>;

function normalize(el: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Tags }, category: string) {
  const t = el.tags ?? {};
  const phone = t.phone || t['contact:phone'] || t['contact:mobile'] || t.mobile || '';
  const website = t.website || t['contact:website'] || t.url || '';
  const address = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    id: `${el.type}/${el.id}`,
    name: t.name || '',
    category,
    address,
    city: t['addr:city'] || '',
    postcode: t['addr:postcode'] || '',
    phone,
    email: t.email || t['contact:email'] || '',
    website,
    instagram: t['contact:instagram'] || '',
    facebook: t['contact:facebook'] || '',
    openingHours: t.opening_hours || '',
    lat: el.lat ?? el.center?.lat ?? null,
    lon: el.lon ?? el.center?.lon ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req, res)) return;
  const category = String(req.query.category ?? '').toLowerCase();
  const place = String(req.query.place ?? '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
  if (!CATEGORIES[category]) return res.status(400).json({ error: 'Categoria non valida', categories: Object.keys(CATEGORIES) });
  if (place.length < 2 || place.length > 80 || /["\\\n]/.test(place)) return res.status(400).json({ error: 'Zona non valida' });

  const filters = CATEGORIES[category].map((f) => `nwr(area.a)${f};`).join('\n');
  const query = `[out:json][timeout:25];
area["boundary"="administrative"]["name"="${place}"]->.a;
(
${filters}
);
out center tags ${limit};`;

  try {
    const r = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'lead-finder/0.1' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(28000),
    });
    if (!r.ok) return res.status(502).json({ error: `Overpass ha risposto ${r.status}` });
    const data = (await r.json()) as { elements: Parameters<typeof normalize>[0][] };
    const leads = data.elements.map((e) => normalize(e, category)).filter((l) => l.name);
    return res.status(200).json({ count: leads.length, leads });
  } catch (e) {
    return res.status(504).json({ error: 'Ricerca non riuscita (timeout o servizio occupato), riprova', detail: String(e) });
  }
}
