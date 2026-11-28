#!/usr/bin/env node
// Weekly TCT dashboard update.
//   node scripts/update.mjs                      live run (needs env secrets)
//   node scripts/update.mjs --fixtures <dir>     offline run from saved source data
// Options: --out <file> (default index.html), --today YYYY-MM-DD, --no-snapshot, --dry-run
//
// Live env: GOOGLE_SERVICE_ACCOUNT_JSON, WETRAVEL_API_KEY
// Exit codes: 0 = published (or skipped: not configured yet), 1 = blocked by a check or error.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSheets } from './lib/sheets.mjs';
import { fetchWeTravelRaw, normalizeWeTravel } from './lib/wetravel.mjs';
import { buildModel } from './lib/transform.mjs';
import { runChecks } from './lib/checks.mjs';
import { buildView, render } from './lib/view.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const summary = (md) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); };
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

const cfg = readJson(join(ROOT, 'config/dashboard.json'));
const today = opt('--today') || new Date().toISOString().slice(0, 10);
const outFile = join(ROOT, opt('--out') || 'index.html');
const snapDir = join(ROOT, 'data/snapshots');

function pickSnapshot() {
  if (!existsSync(snapDir)) return null;
  const files = readdirSync(snapDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const older = files.filter((f) => f.slice(0, 10) < today);
  // Prefer the newest snapshot at least 6 days old, so "last week" means a week.
  const weekOld = older.filter((f) => (Date.parse(today) - Date.parse(f.slice(0, 10))) / 86400000 >= 6);
  const pick = weekOld.at(-1) || older.at(-1);
  return pick ? readJson(join(snapDir, pick)) : null;
}

async function main() {
  let sheets, trips;
  const fx = opt('--fixtures');
  if (fx) {
    sheets = readJson(join(ROOT, fx, 'sheets.json'));
    trips = readJson(join(ROOT, fx, 'wetravel.json'));
  } else {
    const hasG = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON, hasW = !!process.env.WETRAVEL_API_KEY;
    if (!hasG && !hasW) {
      console.log('Not configured yet: GOOGLE_SERVICE_ACCOUNT_JSON and WETRAVEL_API_KEY secrets are missing. Nothing published.');
      summary('### Skipped\nSecrets `GOOGLE_SERVICE_ACCOUNT_JSON` and `WETRAVEL_API_KEY` are not set yet. Nothing was published.');
      output('status', 'skipped');
      return 0;
    }
    if (!hasG || !hasW) throw new Error(`Missing secret: ${!hasG ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : 'WETRAVEL_API_KEY'}`);
    const [s, raw] = await Promise.all([fetchSheets(cfg), fetchWeTravelRaw()]);
    sheets = s;
    trips = normalizeWeTravel(raw, cfg.wetravel);
  }

  const prevSnapshot = pickSnapshot();
  const latestPath = join(ROOT, 'data/latest.json');
  const prevModel = existsSync(latestPath) ? readJson(latestPath) : null;
  const model = buildModel({ sheets, trips, prevSnapshot, cfg, today });
  const result = runChecks(model, { prevModel, prevSnapshot, trips, cfg });

  const lines = [
    `## TCT dashboard update · ${today}`,
    `Booking revenue YTD: $${Math.round(model.kpi.bookingRev).toLocaleString('en-US')} · ${model.kpi.bookings} bookings · ${model.kpi.monthsWithActuals} months of actuals`,
    `${model.nextYear} fill: ${model.fill.pax} pax / ${model.fill.seats} seats across ${model.fill.trips} trips · pipeline table ${model.pipeline.length} trips`,
    `Compared with snapshot: ${model.snapshotFrom || 'none (first run)'}`,
  ];
  if (result.errors.length) lines.push('', '### Blocked: not published', ...result.errors.map((e) => `- ${e}`));
  if (result.warnings.length) lines.push('', '### Warnings', ...result.warnings.map((w) => `- ${w}`));
  const report = lines.join('\n');
  console.log(report);
  summary(report);
  if (!fx) writeFileSync(join(ROOT, 'data/last-run.md'), report + '\n');

  if (!result.ok) { output('status', 'blocked'); return 1; }

  const html = render(readFileSync(join(ROOT, 'src/template.html'), 'utf8'), buildView(model));
  if (flag('--dry-run')) { console.log('Dry run: nothing written.'); output('status', 'dry-run'); return 0; }
  writeFileSync(outFile, html);
  if (!fx) {
    writeFileSync(latestPath, JSON.stringify(model, null, 2) + '\n');
    // Public build marker (date only) so the workflow can confirm the live site serves this build.
    writeFileSync(join(ROOT, 'version.txt'), `${today}\n`);
  }
  if (!flag('--no-snapshot')) {
    mkdirSync(snapDir, { recursive: true });
    const snap = { date: today, trips: trips.map(({ uuid, title, departure, capacity, pax, revenue }) => ({ uuid, title, departure, capacity, pax, revenue })) };
    writeFileSync(join(snapDir, `${today}.json`), JSON.stringify(snap, null, 2) + '\n');
  }
  output('status', 'published');
  console.log(`Wrote ${outFile}`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  const msg = `## TCT dashboard update · ${today}\n\n### Failed: not published\n- ${err.message}`;
  console.error(msg);
  summary(msg);
  try { writeFileSync(join(ROOT, 'data/last-run.md'), msg + '\n'); } catch {}
  output('status', 'failed');
  process.exit(1);
});
