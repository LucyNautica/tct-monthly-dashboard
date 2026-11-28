// WeTravel Partner API (https://developer.wetravel.com).
// Auth: the Partner API key is a refresh token, exchanged for a 1-hour access token.
// Trips come from v3, bookings (orders) per trip from v2. Rate limit: 500 req/min.

const BASE = process.env.WETRAVEL_API_BASE || 'https://api.wetravel.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, opts = {}, attempt = 1) {
  const res = await fetch(url, opts);
  if (res.status === 429 && attempt <= 5) {
    const wait = (Number(res.headers.get('retry-after')) || 10) * 1000;
    await sleep(wait);
    return call(url, opts, attempt + 1);
  }
  if (res.status >= 500 && attempt <= 3) { await sleep(2000 * attempt); return call(url, opts, attempt + 1); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WeTravel ${opts.method || 'GET'} ${url.replace(BASE, '')} failed (${res.status}): ${body.error || body.message || ''}`);
  return body;
}

export async function getAccessToken(key = process.env.WETRAVEL_API_KEY) {
  if (!key) throw new Error('WETRAVEL_API_KEY is not set');
  const body = await call(`${BASE}/v2/auth/tokens/access`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
  });
  const token = body.access_token || body.data?.access_token;
  if (!token) throw new Error('WeTravel auth returned no access_token');
  return token;
}

async function allPages(token, path, params = {}) {
  const out = [];
  for (let page = 1; page < 500; page++) {
    const qs = new URLSearchParams({ ...params, page: String(page) });
    const body = await call(`${BASE}${path}?${qs}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
    out.push(...(body.data || []));
    const p = body.pagination;
    if (!p || !p.has_next || page >= (p.total_pages || page)) break;
  }
  return out;
}

export async function fetchWeTravelRaw() {
  const token = await getAccessToken();
  const trips = await allPages(token, '/v3/trips', { per_page: '200', archived: 'false', deactivated: 'false', sort_by: 'departure_date', sort_order: 'asc' });
  const bookings = {};
  for (const t of trips) {
    if (t.status === 'past' || t.status === 'archived' || t.status === 'deactivated') continue;
    bookings[t.uuid] = await allPages(token, `/v2/bookings/trips/${encodeURIComponent(t.uuid)}/bookings`);
  }
  return { fetchedAt: new Date().toISOString(), trips, bookings };
}

// Raw API → [{ uuid, title, departure, capacity, pax, revenue, orders }]
export function normalizeWeTravel(raw, { amountDivisor = 100 } = {}) {
  const day = (d) => (d ? String(d).slice(0, 10) : null);
  return raw.trips
    .filter((t) => raw.bookings[t.uuid])
    .map((t) => {
      const orders = raw.bookings[t.uuid];
      const active = orders.filter((o) => (o.active_count || 0) > 0);
      const pax = active.reduce((a, o) => a + (o.active_count || 0), 0);
      const revenue = active.reduce((a, o) => a + (o.total_amount || 0) - (o.refunded_amount || 0), 0) / amountDivisor;
      return {
        uuid: String(t.uuid),
        title: String(t.title || '').trim(),
        departure: day(t.recurring ? t.next_departure_date : t.start_date) || day(t.next_departure_date),
        capacity: Number(t.max_people) || 0,
        pax,
        revenue: Math.round(revenue),
        orders: active.length,
      };
    })
    .filter((t) => t.departure)
    .sort((a, b) => a.departure.localeCompare(b.departure) || a.title.localeCompare(b.title));
}
