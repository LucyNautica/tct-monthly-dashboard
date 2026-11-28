// Turns raw sheet grids + WeTravel trips into one numeric model for the dashboard.
// The KPI sheet is the master: totals come from its Total column, never re-added here.
import { num, clean, findRow, months, total, requireNum, isoDate } from './parse.mjs';

const STOP = new Set(['2026', '2027', '2028', 'new', 'tour', 'trip', 'the', 'and', '&', 'of', 'tours', 'adventure']);
export const tokens = (s) =>
  clean(s).toLowerCase().replace(/[^a-z0-9#& ]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w));
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

export function shortName(pricingName) {
  return clean(pricingName).replace(/\b20\d\d\b/g, '').replace(/\bNew\b/gi, '').replace(/\s+/g, ' ').trim();
}

// ── KPI SHEET ──
export function kpiModel(s, cfg) {
  const A = (label, opt = {}) => findRow(s.actual, label, { ...opt, tab: cfg.sheets.kpi.tabs.actual });
  const F = (label, opt = {}) => findRow(s.forecast, label, { ...opt, tab: cfg.sheets.kpi.tabs.forecast });
  const P = (label, opt = {}) => findRow(s.prior, label, { ...opt, tab: cfg.sheets.kpi.tabs.prior });

  const bookRow = A('Bookings Revenue');
  const monthly = months(bookRow);
  const monthsWithActuals = monthly.reduce((n, v, i) => (v !== null && v !== 0 ? i + 1 : n), 0);
  const actualsMonthly = monthly.map((v, i) => (i < monthsWithActuals ? v ?? 0 : null));

  const priorBook = P('Bookings Revenue');
  const seasonality = months(P('- Seasonality'));
  const priorBarsTotal = cfg.chart?.priorYearBarsTotal;
  const priorMonthly = priorBarsTotal
    ? seasonality.map((r) => Math.round(priorBarsTotal * (r ?? 0)))
    : months(priorBook).map((v) => v ?? 0);

  const fBook = F('Bookings Revenue');
  const k = {
    monthsWithActuals,
    actualsMonthly,
    priorMonthly,
    forecastMonthly: months(fBook).map((v) => Math.round(v ?? 0)),
    bookingRev: requireNum(total(bookRow), 'KPI 2026 Actual > Bookings Revenue total'),
    bookings: requireNum(total(A('#bookings')), 'KPI 2026 Actual > #bookings total'),
    departureRev: requireNum(total(A('Departure Revenue')), 'KPI 2026 Actual > Departure Revenue total'),
    grossMargin: requireNum(total(A('Gross Margin')), 'KPI 2026 Actual > Gross Margin total'),
    grossMarginPct: requireNum(total(A('- %', { after: 'Gross Margin' })), 'KPI 2026 Actual > Gross Margin %'),
    ebitda: requireNum(total(A('EBITDA')), 'KPI 2026 Actual > EBITDA total'),
    ebitdaPct: requireNum(total(A('- %', { after: 'EBITDA' })), 'KPI 2026 Actual > EBITDA %'),
    forecast: {
      bookingRev: requireNum(total(fBook), 'KPI Forecast > Bookings Revenue total'),
      bookings: requireNum(total(F('#bookings')), 'KPI Forecast > #bookings total'),
      departureRev: requireNum(total(F('Departure Revenue')), 'KPI Forecast > Departure Revenue total'),
      grossMargin: requireNum(total(F('Gross Margin')), 'KPI Forecast > Gross Margin total'),
      grossMarginPct: requireNum(total(F('- %', { after: 'Gross Margin' })), 'KPI Forecast > Gross Margin %'),
      ebitda: requireNum(total(F('EBITDA')), 'KPI Forecast > EBITDA total'),
      ebitdaPct: requireNum(total(F('- %', { after: 'EBITDA' })), 'KPI Forecast > EBITDA %'),
    },
    prior: {
      bookingRev: requireNum(total(priorBook), 'KPI 2025 > Bookings Revenue total'),
      departureRev: requireNum(total(P('Departure Revenue')), 'KPI 2025 > Departure Revenue total'),
      grossMargin: requireNum(total(P('Gross Margin')), 'KPI 2025 > Gross Margin total'),
      grossMarginPct: requireNum(total(P('- %', { after: 'Gross Margin' })), 'KPI 2025 > Gross Margin %'),
      aov: requireNum(total(P('AOV')), 'KPI 2025 > AOV total'),
    },
  };
  k.aov = k.bookings > 0 ? k.bookingRev / k.bookings : 0;

  // Collette 2025 bookings (Working Data tab)
  const col = findRow(s.working, 'Revenue - Collette', { tab: cfg.sheets.kpi.tabs.working, required: false });
  k.collettePrior = col ? total(col) : null;

  // Quarter tracker: rows "1".."4" → target, cumulative, difference
  k.quarters = [1, 2, 3, 4].map((q) => {
    const row = s.tracker.find((r) => clean(r[0]) === String(q));
    if (!row) throw new Error(`KPI ${cfg.sheets.kpi.tabs.tracker}: quarter ${q} row not found`);
    return { q, target: requireNum(num(row[1]), `Q${q} target`), actual: num(row[2]) ?? 0, diff: num(row[3]) ?? 0 };
  });
  return k;
}

// ── 2026 PRICING SHEET: tour profitability ──
export function currentTripsModel(grid, cfg) {
  const hi = grid.findIndex((r) => clean(r[0]).toLowerCase() === 'trip');
  if (hi < 0) throw new Error(`Pricing "${cfg.sheets.pricingCurrent.tab}": header row "Trip" not found`);
  const h = grid[hi].map((x) => clean(x).toLowerCase());
  const col = (name) => { const i = h.indexOf(name); if (i < 0) throw new Error(`Pricing 2026: column "${name}" not found`); return i; };
  const c = { profit: col('profit'), rev: col('total rev sold'), pct: col('profit %'), seats: col('total seats'), sold: col('total seats sold') };
  const exclude = new Set((cfg.tripsCurrentYear?.exclude || []).map((x) => x.toLowerCase()));
  const rename = cfg.tripsCurrentYear?.rename || {};
  const rows = [];
  for (const r of grid.slice(hi + 1)) {
    const name = clean(r[0]);
    if (!name || name.toLowerCase() === 'total') continue;
    if (exclude.has(name.toLowerCase())) continue;
    const rev = num(r[c.rev]);
    if (rev === null) continue;
    rows.push({
      t: rename[name] || name,
      r: Math.round(rev),
      p: Math.round(num(r[c.profit]) ?? 0),
      m: num(r[c.pct]) ?? (rev ? (num(r[c.profit]) ?? 0) / rev : 0),
      s: num(r[c.seats]) ?? 0,
      c: num(r[c.sold]) ?? 0,
    });
  }
  return rows;
}

// ── 2027 PRICING SUMMARY: cost / list per person by tour ──
export function nextPricingModel(grid, cfg) {
  const hi = grid.findIndex((r) => clean(r[0]).toLowerCase() === 'tour name');
  if (hi < 0) throw new Error(`Pricing "${cfg.sheets.pricingNext.tab}": header row "Tour Name" not found`);
  const h = grid[hi].map((x) => clean(x).toLowerCase());
  const find = (start) => { const i = h.findIndex((x) => x.startsWith(start)); if (i < 0) throw new Error(`Pricing 2027: column "${start}…" not found`); return i; };
  const c = { dep: find('departure date'), cost: find('total cost pp'), list: find('list price pp') };
  return grid.slice(hi + 1)
    .map((r) => ({ name: clean(r[0]), departure: isoDate(r[c.dep]), costPP: num(r[c.cost]), listPP: num(r[c.list]) }))
    .filter((r) => r.name && !r.name.startsWith('←') && !/^total/i.test(r.name));
}

// Words match when equal, or when one starts the other (min 4 letters: "norther" ~ "northern").
const wordMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
const overlapCount = (a, b) => tokens(a).filter((w) => tokens(b).some((v) => wordMatch(w, v))).length;
const hashNum = (s) => (s.match(/#\s*(\d)/) || [])[1] || null;

// Match a WeTravel trip to a pricing row. Rules, in order:
// 1. manual override by WeTravel id; 2. departure within N days and a shared word (best overlap wins);
// 3. date alone, only if exactly one pricing row departs in that window. "#1"/"#2" must agree.
export function matchPricing(trip, pricing, { matchDays = 3, overrides = {} } = {}) {
  if (overrides[trip.uuid]) return pricing.find((p) => p.name === overrides[trip.uuid]) || null;
  const inWindow = pricing.filter((p) => !p.departure || !trip.departure || Math.abs(daysBetween(p.departure, trip.departure)) <= matchDays);
  const dated = inWindow.filter((p) => p.departure);
  const ok = inWindow.filter((p) => !(hashNum(p.name) && hashNum(trip.title) && hashNum(p.name) !== hashNum(trip.title)));
  let best = null, bestScore = 0;
  for (const p of ok) {
    const score = overlapCount(p.name, trip.title);
    if (score > bestScore) { best = p; bestScore = score; }
  }
  if (best) return best;
  return dated.length === 1 && ok.includes(dated[0]) ? dated[0] : null;
}

// Find a trip's entry in an older snapshot: by uuid, else by date + a shared word.
export function findInSnapshot(trip, snap, matchDays = 3) {
  if (!snap) return null;
  const byId = snap.trips.find((t) => t.uuid && t.uuid === trip.uuid);
  if (byId) return byId;
  return snap.trips.find((t) =>
    t.departure && Math.abs(daysBetween(t.departure, trip.departure)) <= matchDays &&
    !(hashNum(t.title) && hashNum(trip.title) && hashNum(t.title) !== hashNum(trip.title)) &&
    overlapCount(t.title, trip.title) > 0) || null;
}

// ── Rule-based notes ──
export function weekNote({ before, now, revBefore, revNow, pax, cap, days }) {
  const parts = [];
  const pd = now - before, rd = revNow - revBefore;
  const money = (v) => `$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  if (before === null) parts.push('New in this update');
  else if (pd > 0) parts.push(`+${pd} pax (+${money(rd)})`);
  else if (pd < 0) parts.push(`${pd} pax (${rd < 0 ? '-' : '+'}${money(rd)})`);
  else if (rd !== 0) parts.push(`No pax change, revenue ${rd > 0 ? '+' : '-'}${money(rd)}`);
  else parts.push('No movement');
  const fill = cap > 0 ? pax / cap : 0;
  if (fill >= 1) parts.push('sold out');
  else if (fill >= 0.9) parts.push(`${Math.round(fill * 100)}% full`);
  else if (days > 0 && days <= 120 && fill < 0.35) parts.push(`departs in ${days} days at ${Math.round(fill * 100)}% full, needs a push`);
  else if (days > 0 && days <= 60 && fill < 0.6) parts.push(`departs in ${days} days at ${Math.round(fill * 100)}% full`);
  else if (pax === 0) parts.push('no bookings yet');
  return parts.join(' · ');
}

// ── Full model ──
export function buildModel({ sheets, trips, prevSnapshot, cfg, today }) {
  const kpi = kpiModel(sheets, cfg);
  const current = currentTripsModel(sheets.totals, cfg);
  const pricing = nextPricingModel(sheets.summary, cfg);
  const nextYear = String(cfg.year + 1);
  const wcfg = cfg.wetravel || {};
  const rename = wcfg.rename || {};

  const upcoming = trips.filter((t) => daysBetween(t.departure, today) > 0);
  const nextYearTrips = trips.filter((t) => t.departure.startsWith(nextYear));

  const pipeline = [];
  for (const t of nextYearTrips) {
    const p = matchPricing(t, pricing, wcfg);
    if (!p || p.costPP === null || p.listPP === null || !p.listPP) continue;
    pipeline.push({ uuid: t.uuid, t: rename[t.uuid] || (wcfg.displayNames || {})[shortName(p.name)] || shortName(p.name), r: t.revenue, s: t.capacity, c: t.pax, costPP: p.costPP, listPP: p.listPP, dep: t.departure });
  }
  const unmatched = nextYearTrips.filter((t) => !pipeline.some((p) => p.uuid === t.uuid)).map((t) => `${t.title} (${t.departure})`);

  const changes = pipeline.map((p) => {
    const t = trips.find((x) => x.uuid === p.uuid);
    const old = findInSnapshot(t, prevSnapshot, wcfg.matchDays);
    const days = daysBetween(t.departure, today);
    const row = { name: p.t, dep: t.departure, before: old ? old.pax : null, now: t.pax, revBefore: old ? old.revenue : null, revNow: t.revenue };
    row.note = weekNote({ ...row, pax: t.pax, cap: t.capacity, days });
    return row;
  }).sort((a, b) => a.dep.localeCompare(b.dep));

  const occupancy = upcoming
    .filter((t) => daysBetween(t.departure, today) <= (cfg.occupancy?.windowDays ?? 300) && t.capacity > 0)
    .map((t) => ({ name: rename[t.uuid] || t.title, dep: t.departure, pax: t.pax, cap: t.capacity }));

  const fill = {
    pax: nextYearTrips.reduce((a, t) => a + t.pax, 0),
    seats: nextYearTrips.reduce((a, t) => a + t.capacity, 0),
    trips: nextYearTrips.length,
    revenue: nextYearTrips.reduce((a, t) => a + t.revenue, 0),
  };

  return {
    today, year: cfg.year, nextYear: cfg.year + 1, targets: cfg.targets,
    kpi, current, pipeline, changes, occupancy, fill, unmatched,
    snapshotFrom: prevSnapshot?.date || null,
  };
}
