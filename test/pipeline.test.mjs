// Unit tests with made-up numbers (no client data in the repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, isoDate, findRow } from '../scripts/lib/parse.mjs';
import { matchPricing, weekNote, shortName } from '../scripts/lib/transform.mjs';
import { normalizeWeTravel } from '../scripts/lib/wetravel.mjs';
import { runChecks } from '../scripts/lib/checks.mjs';
import { render, moneyTile, signedPct } from '../scripts/lib/view.mjs';

test('num parses sheet money, percent and accounting formats', () => {
  assert.equal(num('$3,048,551.00'), 3048551);
  assert.equal(num('-$21,895.00'), -21895);
  assert.equal(num(' $ (2,200.00) '), -2200);
  assert.equal(num(' $ -  '), 0);
  assert.equal(num('$‎ 70,300.00'), 70300);
  assert.equal(num('26.58%'), 0.2658);
  assert.equal(num('-0.07%'), -0.0007);
  assert.equal(num('827.00'), 827);
  assert.equal(num('#DIV/0!'), null);
  assert.equal(num(''), null);
  assert.equal(num('Holding'), null);
});

test('isoDate handles the sheet date styles', () => {
  assert.equal(isoDate('11 Jan 2027'), '2027-01-11');
  assert.equal(isoDate('1/12/2027'), '2027-01-12');
  assert.equal(isoDate('2027-05-03T00:00:00.000Z'), '2027-05-03');
  assert.equal(isoDate('TBD'), null);
});

test('findRow respects "after" anchors and trims labels', () => {
  const g = [['Gross Margin', '1'], [' - %', '10%'], ['EBITDA', '2'], [' - %', '20%']];
  assert.equal(findRow(g, '- %', { after: 'EBITDA' })[1], '20%');
  assert.throws(() => findRow(g, 'Missing', { tab: 'X' }), /row "Missing" not found/);
});

test('matchPricing uses departure date, then name, and respects #numbers', () => {
  const pricing = [
    { name: 'Ireland #1 2027', departure: '2027-05-03', costPP: 1, listPP: 2 },
    { name: 'Michigan 2027 New', departure: '2027-05-03', costPP: 1, listPP: 2 },
    { name: 'Ireland #2 2027', departure: '2027-08-03', costPP: 1, listPP: 2 },
  ];
  assert.equal(matchPricing({ uuid: 'a', title: 'Michigan Tulips', departure: '2027-05-03' }, pricing).name, 'Michigan 2027 New');
  assert.equal(matchPricing({ uuid: 'b', title: 'Ireland Adventure #1', departure: '2027-05-04' }, pricing).name, 'Ireland #1 2027');
  assert.equal(matchPricing({ uuid: 'c', title: 'Ireland Adventure #2', departure: '2027-05-03' }, pricing), null);
  assert.equal(shortName(' St Louis-Kc 2027 New'), 'St Louis-Kc');
});

test('weekNote writes plain rule-based notes', () => {
  assert.equal(weekNote({ before: 10, now: 12, revBefore: 1000, revNow: 3000, pax: 12, cap: 50, days: 300 }), '+2 pax (+$2,000)');
  assert.equal(weekNote({ before: 5, now: 5, revBefore: 1000, revNow: 1000, pax: 5, cap: 50, days: 40 }), 'No movement · departs in 40 days at 10% full, needs a push');
  assert.equal(weekNote({ before: 47, now: 48, revBefore: 0, revNow: 100, pax: 48, cap: 50, days: 300 }), '+1 pax (+$100) · 96% full');
  assert.equal(weekNote({ before: null, now: 0, revBefore: null, revNow: 0, pax: 0, cap: 25, days: 300 }), 'New in this update · no bookings yet');
});

test('normalizeWeTravel counts active travellers and converts cents', () => {
  const raw = {
    trips: [{ uuid: 't1', title: 'Test Trip', start_date: '2027-03-01T00:00:00.000Z', max_people: 40, status: 'upcoming' }],
    bookings: { t1: [
      { active_count: 2, cancelled_count: 0, total_amount: 800000, refunded_amount: 0 },
      { active_count: 0, cancelled_count: 1, total_amount: 400000, refunded_amount: 400000 },
      { active_count: 1, cancelled_count: 1, total_amount: 800000, refunded_amount: 400000 },
    ] },
  };
  const [t] = normalizeWeTravel(raw, { amountDivisor: 100 });
  assert.deepEqual([t.departure, t.capacity, t.pax, t.revenue, t.orders], ['2027-03-01', 40, 3, 12000, 2]);
});

test('checks block a wrong money unit and a revenue drop', () => {
  const base = {
    year: 2026, nextYear: 2027, unmatched: [], pipeline: [{}], fill: { pax: 10, seats: 50 },
    kpi: { actualsMonthly: [100, 100], bookingRev: 200, bookings: 2, grossMarginPct: 0.2, monthsWithActuals: 2, quarters: [{ actual: 200 }] },
  };
  const cfg = { checks: {} };
  const trips = [{ title: 'A', pax: 10, revenue: 50, capacity: 50 }, { title: 'B', pax: 5, revenue: 20, capacity: 50 }];
  const r1 = runChecks(base, { trips, cfg });
  assert.equal(r1.ok, false);
  assert.match(r1.errors.join(), /wrong money unit/);
  const good = [{ title: 'A', pax: 10, revenue: 30000, capacity: 50 }];
  const prevModel = { year: 2026, kpi: { bookingRev: 400, monthsWithActuals: 2 } };
  const r2 = runChecks(base, { trips: good, cfg, prevModel });
  assert.match(r2.errors.join(), /fell 50.0%/);
  assert.equal(runChecks(base, { trips: good, cfg }).ok, true);
});

test('render refuses missing or unused tokens', () => {
  assert.equal(render('<p>{{A}}</p>', { A: '<b>' }), '<p>&lt;b&gt;</p>');
  assert.throws(() => render('{{A}} {{B}}', { A: 1 }), /\{\{B\}\} has no value/);
  assert.throws(() => render('{{A}}', { A: 1, C: 2 }), /not used by template: C/);
  assert.equal(moneyTile(3048551), '$3.05M');
  assert.equal(moneyTile(817766), '$818K');
  assert.equal(signedPct(0.4846), '+48.5%');
});
