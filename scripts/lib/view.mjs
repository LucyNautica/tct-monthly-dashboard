// Model → display strings and the JS data block for src/template.html.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
export const moneyK = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v / 1000)).toLocaleString('en-US')}K`;
export const moneyM = (v, d = 2) => `$${(v / 1e6).toFixed(d)}M`;
// Tile style: $3.05M above a million, $818K below.
export const moneyTile = (v) => (Math.abs(v) >= 1e6 ? moneyM(v) : moneyK(v));
// Short target labels: $2.5M, $5.0M, $625K
export const moneyShort = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : moneyK(v));
export const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
export const signedPct = (v, d = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
const signedK = (v) => `${v >= 0 ? '+' : '-'}${moneyK(Math.abs(v))}`;
const width = (v) => `${Math.max(0, Math.min(100, Math.round(v * 1000) / 10))}%`;
const up = (cond) => (cond ? '▲' : '▼');
const dClass = (cond) => (cond ? 'delta-up' : 'delta-down');

export function dateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d} ${y}`;
}

export function buildView(model) {
  const { kpi: k, targets: T, year: Y, nextYear: NY } = model;
  const PY = Y - 1;
  const n = k.monthsWithActuals;
  const range = n === 1 ? 'Jan' : `Jan–${MONTHS[n - 1]}`;
  const left = 12 - n;
  const growth = k.bookingRev / k.prior.bookingRev - 1;
  const t = {};

  t.UPDATED_LABEL = dateLabel(model.today);
  t.YEAR = Y; t.PRIOR_YEAR = PY; t.NEXT_YEAR = NY;
  t.MONTH_RANGE = range;

  // Booking revenue tile
  const beatBase = k.bookingRev >= T.base, beatStretch = k.bookingRev >= T.stretch;
  t.BR_TILE_CLASS = beatBase ? 'positive' : 'warning';
  t.BR_VALUE = moneyTile(k.bookingRev);
  t.BR_DELTA_CLASS = dClass(growth >= 0);
  t.BR_DELTA = `${up(growth >= 0)} ${signedPct(growth)} vs ${moneyM(k.prior.bookingRev)} in ${PY}`;
  t.BASE_LABEL = `BASE ${moneyShort(T.base)}`;
  t.BASE_WIDTH = width(k.bookingRev / T.base);
  t.BASE_COLOR = beatBase ? 'var(--green)' : 'var(--accent)';
  t.BASE_VAL = beatBase ? '✓ Beat' : pct(k.bookingRev / T.base);
  t.BASE_VAL_STYLE = beatBase ? 'color:var(--green)' : '';
  t.STRETCH_LABEL = `STRETCH ${moneyShort(T.stretch)}`;
  t.STRETCH_WIDTH = width(k.bookingRev / T.stretch);
  t.STRETCH_COLOR = beatStretch ? 'var(--green)' : 'var(--accent)';
  t.STRETCH_VAL = beatStretch ? '✓ Beat' : pct(k.bookingRev / T.stretch);
  t.STRETCH_VAL_STYLE = beatStretch ? 'color:var(--green)' : '';
  t.BR_SUB = `${signedK(k.bookingRev - T.base)} vs base · ${k.bookings.toLocaleString('en-US')} bookings · ${left === 0 ? 'full year' : `${left} month${left === 1 ? '' : 's'} remaining`}`;

  // Departure revenue
  const drUp = k.departureRev >= k.prior.departureRev;
  t.DR_VALUE = moneyTile(k.departureRev);
  t.DR_DELTA_CLASS = dClass(drUp);
  t.DR_DELTA = `${up(drUp)} vs ${moneyM(k.prior.departureRev)} in ${PY}`;
  t.DR_BAR = width(k.prior.departureRev / k.departureRev);

  // Gross margin $ and %
  const gmUp = k.grossMargin >= k.prior.grossMargin;
  t.GM_TILE_CLASS = gmUp ? 'positive' : 'warning';
  t.GM_VALUE = moneyTile(k.grossMargin);
  t.GM_DELTA_CLASS = dClass(gmUp);
  t.GM_DELTA = `${up(gmUp)} from ${moneyTile(k.prior.grossMargin)} in ${PY}`;
  t.GM_BAR = width(k.prior.grossMargin / k.grossMargin);
  const gmpUp = k.grossMarginPct >= k.prior.grossMarginPct;
  t.GMP_TILE_CLASS = gmpUp ? 'positive' : 'warning';
  t.GMP_VALUE = pct(k.grossMarginPct);
  t.GMP_DELTA_CLASS = dClass(gmpUp);
  t.GMP_DELTA = `${up(gmpUp)} vs ${pct(k.prior.grossMarginPct)} in ${PY}`;
  t.GMP_BAR = width(k.grossMarginPct);

  // EBITDA
  const ebUp = k.ebitda >= 0;
  t.EB_TILE_CLASS = ebUp ? 'positive' : 'warning';
  t.EB_VALUE = moneyTile(k.ebitda);
  t.EB_DELTA_CLASS = dClass(k.ebitdaPct >= k.forecast.ebitdaPct);
  t.EB_DELTA = `${up(k.ebitdaPct >= k.forecast.ebitdaPct)} ${pct(k.ebitdaPct)} margin`;
  t.EB_SUB = `Forecast full-year: ${pct(k.forecast.ebitdaPct)}`;
  t.EB_BAR = width(k.ebitdaPct);

  // Bookings + AOV
  t.BK_VALUE = k.bookings.toLocaleString('en-US');
  t.BK_SUB = `${range} ${Y}`;
  t.BK_BAR = width(k.bookings / k.forecast.bookings);
  const aovChg = k.aov / k.prior.aov - 1;
  t.AOV_TILE_CLASS = aovChg >= 0 ? 'positive' : 'warning';
  t.AOV_VALUE = money(k.aov);
  t.AOV_DELTA_CLASS = dClass(aovChg >= 0);
  t.AOV_DELTA = `${up(aovChg >= 0)} ${signedPct(aovChg)} vs ${money(k.prior.aov)} in ${PY}`;
  t.AOV_SUB = `$${k.aov.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per booking transaction`;
  t.AOV_BAR = width(k.prior.aov / k.aov);

  // Next-year trip fill
  const f = model.fill;
  const fillPct = f.seats ? f.pax / f.seats : 0;
  t.FILL_TILE_CLASS = fillPct >= 0.6 ? 'positive' : 'warning';
  t.FILL_VALUE = pct(fillPct);
  t.FILL_DELTA = `${f.pax.toLocaleString('en-US')} pax / ${f.seats.toLocaleString('en-US')} seats · ${f.trips} trips`;
  t.FILL_SUB = `${moneyM(f.revenue)} booked · ${moneyShort(T.nextBase)} base target`;
  t.FILL_BAR = width(fillPct);
  t.FILL_BAR_COLOR = fillPct >= 0.6 ? 'var(--green)' : 'var(--amber)';

  // Chart
  t.FORECAST_SHORT = moneyShort(k.forecast.bookingRev);

  // Quarters
  const qNames = ['Q1 Jan–Mar', 'Q2 Apr–Jun', 'Q3 Jul–Sep', 'Q4 Oct–Dec'];
  const qTarget = k.quarters[0].target;
  t.QTR_LABEL = `(Base: ${moneyK(qTarget)}/qtr · Annual ${moneyShort(T.base)})`;
  t.QUARTERS_HTML = k.quarters.map((q, i) => {
    const lastMonth = (i + 1) * 3;
    const started = n > i * 3;
    const complete = n >= lastMonth;
    let valStyle, status, statusStyle, targetLine = `Target: ${money(q.target)}`;
    if (!started) {
      valStyle = 'class="q-val dim"'; status = 'Not started'; statusStyle = 'class="q-status dim"';
    } else if (complete || q.diff >= 0) {
      const ok = q.diff >= 0;
      valStyle = `class="q-val ${ok ? 'pos' : 'neg'}"`;
      status = ok ? `+${money(q.diff)} above target ✓` : `${money(q.diff)} below target`;
      statusStyle = `class="q-status ${ok ? 'pos' : 'neg'}"`;
    } else {
      const done = MONTHS.slice(i * 3, n);
      const rest = MONTHS.slice(n, lastMonth);
      targetLine += ` · ${done.length > 1 ? `${done[0]}–${done[done.length - 1]}` : done[0]} actual`;
      valStyle = 'class="q-val" style="color:var(--amber)"';
      status = `–${money(-q.diff)} remaining (${rest.length > 1 ? `${rest[0]}–${rest[rest.length - 1]}` : rest[0]})`;
      statusStyle = 'class="q-status" style="color:var(--amber)"';
    }
    return `      <div class="q-card">
        <div class="q-label">${esc(qNames[i])}</div>
        <div ${valStyle}>${esc(money(q.actual))}</div>
        <div class="q-target">${esc(targetLine)}</div>
        <div ${statusStyle}>${esc(status)}</div>
      </div>`;
  }).join('\n');

  // 3-year comparison tables
  const row = (cls, cells) => `                <tr${cls ? ` class="${cls}"` : ''}>\n${cells.map(([c, v]) => `                  <td${c ? ` class="${c}"` : ''}>${esc(v)}</td>`).join('\n')}\n                </tr>`;
  const ytdLabel = `${Y} YTD (${MONTHS[n - 1]})`;
  const fcGrowth = k.forecast.bookingRev / k.prior.bookingRev - 1;
  const nbGrowth = T.nextBase / k.forecast.bookingRev - 1;
  const nsGrowth = T.nextStretch / k.forecast.bookingRev - 1;
  const vsBase = k.bookingRev - T.base;
  t.BOOK_TABLE_HTML = [
    row('', [['dim', `${PY} Actual`], ['right num', money(k.prior.bookingRev)], ['right dim num', '—'], ['right dim num', '—']]),
    row('', [['', ytdLabel], ['right num', money(k.bookingRev)], [`right ${growth >= 0 ? 'pos' : 'neg'} num`, signedPct(growth)], [`right ${vsBase >= 0 ? 'pos' : 'neg'} num`, `${signedK(vsBase)} vs base`]]),
    row('', [['', `${Y} Forecast`], ['right num', money(k.forecast.bookingRev)], [`right ${fcGrowth >= 0 ? 'pos' : 'neg'} num`, signedPct(fcGrowth)], [`right ${k.forecast.bookingRev >= T.base ? 'pos' : 'neg'} num`, k.forecast.bookingRev >= T.base ? 'Base ✓' : `${signedK(k.forecast.bookingRev - T.base)} vs base`]]),
    row('total-row', [['', `${NY} Base Target`], ['right num', money(T.nextBase)], ['right pos num', signedPct(nbGrowth, 0)], ['right dim num', 'Base']]),
    row('stretch-row', [['', `${NY} Stretch`], ['right num', money(T.nextStretch)], ['right pos num', signedPct(nsGrowth, 0)], ['right num', `+${moneyShort(T.nextStretch - T.nextBase)}`]]),
  ].join('\n');
  const depDiff = T.nextDepartureStretch - T.nextDepartureBase;
  t.DEP_TABLE_HTML = [
    row('', [['dim', `${PY} Actual`], ['right num', money(k.prior.departureRev)], ['right num', pct(k.prior.grossMarginPct)], ['right dim num', '—']]),
    row('', [['', ytdLabel], ['right num', money(k.departureRev)], [`right ${k.grossMarginPct >= k.prior.grossMarginPct ? 'pos' : 'neg'} num`, pct(k.grossMarginPct)], [`right ${k.ebitda >= 0 ? 'pos' : 'neg'} num`, moneyK(k.ebitda)]]),
    row('', [['', `${Y} Forecast`], ['right num', money(k.forecast.departureRev)], ['right num', pct(k.forecast.grossMarginPct)], ['right num', moneyK(k.forecast.ebitda)]]),
    row('total-row', [['', `${NY} Base Target`], ['right num', money(T.nextDepartureBase)], ['right dim num', 'Base'], ['right dim num', 'Base']]),
    row('stretch-row', [['', `${NY} Stretch`], ['right num', money(T.nextDepartureStretch)], ['right num', signedK(depDiff)], ['right num', signedK(depDiff)]]),
  ].join('\n');

  // Collette banner
  t.COLLETTE_PRIOR = k.collettePrior ? `~${moneyK(k.collettePrior)}` : 'Part of';

  // Current-year tour profitability total
  const cr = model.current.reduce((a, d) => a + d.r, 0);
  const cp = model.current.reduce((a, d) => a + d.p, 0);
  const cm = cr ? cp / cr : 0;
  const cmLabel = cm >= 0.2 ? ['green', 'STRONG'] : cm >= 0.1 ? ['amber', 'OK'] : ['red', 'WEAK'];
  t.TRIPS_CUR_TOTAL_HTML = `<td><strong>TOTAL</strong></td>
                <td class="right num">${esc(moneyK(cr))}</td>
                <td class="right num ${cp >= 0 ? 'pos' : 'neg'}">${esc(moneyK(cp))}</td>
                <td class="right num">${esc(pct(cm))}</td>
                <td><span class="rag ${cmLabel[0]}">${cmLabel[1]}</span></td>`;
  t.PRICING_MONTH = `${MONTHS[Number(model.today.slice(5, 7)) - 1]} ${model.today.slice(0, 4)}`;

  // Change section
  t.CHANGE_LABEL = model.snapshotFrom
    ? `${dateLabel(model.snapshotFrom).replace(/ \d{4}$/, '')} → ${dateLabel(model.today)}`
    : `First automated snapshot · ${dateLabel(model.today)}`;

  const data = {
    year: Y, priorYear: PY, monthsWithActuals: n,
    actualsCur: k.actualsMonthly, actualsPrior: k.priorMonthly, forecastCur: k.forecastMonthly,
    tripsCur: model.current,
    tripsNext: model.pipeline.map(({ t: name, r, s, c, costPP, listPP }) => ({ t: name, r, s, c, costPP, listPP })),
    weekChanges: model.changes,
    snapshotFrom: model.snapshotFrom, today: model.today,
    tripData: model.occupancy,
  };
  t.DATA_JSON = JSON.stringify(data).replace(/</g, '\\u003c');
  return t;
}

const RAW = new Set(['QUARTERS_HTML', 'BOOK_TABLE_HTML', 'DEP_TABLE_HTML', 'TRIPS_CUR_TOTAL_HTML', 'DATA_JSON']);

export function render(template, tokens) {
  const used = new Set();
  const out = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in tokens)) throw new Error(`Template token {{${key}}} has no value`);
    used.add(key);
    return RAW.has(key) ? String(tokens[key]) : esc(tokens[key]);
  });
  const unused = Object.keys(tokens).filter((x) => !used.has(x));
  if (unused.length) throw new Error(`Tokens not used by template: ${unused.join(', ')}`);
  return out;
}
