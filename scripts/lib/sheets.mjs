// Read-only Google Sheets access with a service account. No dependencies:
// signs the OAuth JWT with node:crypto and calls the Sheets REST API.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const b64url = (b) => Buffer.from(b).toString('base64url');

export function loadServiceAccount(raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  let sa;
  try { sa = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON)'); }
  if (!sa.client_email || !sa.private_key) throw new Error('Service account JSON is missing client_email or private_key');
  return sa;
}

export async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${signer.sign(sa.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google auth failed (${res.status}): ${body.error_description || body.error || 'no token'}`);
  return body.access_token;
}

// Returns { [range]: values[][] } using formatted values (same format as the sheet shows).
export async function batchGet(token, spreadsheetId, ranges) {
  const qs = new URLSearchParams();
  ranges.forEach((r) => qs.append('ranges', r));
  qs.set('valueRenderOption', 'FORMATTED_VALUE');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${qs}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = res.status === 403 ? ' (is the sheet shared with the service account email?)' : '';
    throw new Error(`Sheets read failed for ${spreadsheetId} (${res.status})${hint}: ${body.error?.message || ''}`);
  }
  const out = {};
  (body.valueRanges || []).forEach((vr, i) => { out[ranges[i]] = vr.values || []; });
  return out;
}

export function sheetRanges(cfg) {
  const t = cfg.sheets.kpi.tabs;
  const q = (tab, a1) => `'${tab.replace(/'/g, "''")}'!${a1}`;
  return {
    kpi: {
      id: cfg.sheets.kpi.id,
      ranges: {
        actual: q(t.actual, 'A1:P60'),
        forecast: q(t.forecast, 'A1:P40'),
        prior: q(t.prior, 'A1:P40'),
        tracker: q(t.tracker, 'A1:G12'),
        working: q(t.working, 'A1:P30'),
      },
    },
    pricingCurrent: { id: cfg.sheets.pricingCurrent.id, ranges: { totals: q(cfg.sheets.pricingCurrent.tab, 'A1:M80') } },
    pricingNext: { id: cfg.sheets.pricingNext.id, ranges: { summary: q(cfg.sheets.pricingNext.tab, 'A1:I120') } },
  };
}

// Fetch everything the dashboard needs: { actual, forecast, prior, tracker, working, totals, summary }
export async function fetchSheets(cfg) {
  const token = await getAccessToken(loadServiceAccount());
  const plan = sheetRanges(cfg);
  const out = {};
  for (const src of Object.values(plan)) {
    const keys = Object.keys(src.ranges);
    const res = await batchGet(token, src.id, keys.map((k) => src.ranges[k]));
    keys.forEach((k) => { out[k] = res[src.ranges[k]]; });
  }
  return out;
}
