// Helpers for reading Google Sheets "formatted value" grids.
// Cells arrive as strings like "$3,048,551.00", "-$21,895.00", " $ (2,200.00) ",
// "26.58%", "$‎ 70,300.00" (with invisible marks), "#DIV/0!" or "".

export function num(cell) {
  if (cell === undefined || cell === null) return null;
  if (typeof cell === 'number') return cell;
  const s = String(cell).replace(/[‎‏ \s]/g, '');
  if (s === '' || s.startsWith('#')) return null;
  if (s === '$-' || s === '-') return 0; // accounting format for zero
  if (!/^\(?-?\$?-?\(?[\d,]*\.?\d+\)?%?\)?$/.test(s)) return null;
  const neg = s.includes('(') || s.includes('-');
  const isPct = s.endsWith('%') || s.endsWith('%)');
  let v = parseFloat(s.replace(/[^\d.]/g, ''));
  if (isPct) v = Number((v / 100).toPrecision(12));
  return neg ? -v : v;
}

export const clean = (s) => String(s ?? '').replace(/[‎‏ ]/g, ' ').replace(/\s+/g, ' ').trim();

// Find the first row whose column A matches `label` (case/space-insensitive).
// `after`: only search below the first row matching this label.
export function findRow(grid, label, { after, required = true, tab = '' } = {}) {
  const norm = (x) => clean(x).toLowerCase();
  let start = 0;
  if (after) {
    const a = grid.findIndex((r) => norm(r[0]) === norm(after));
    if (a < 0) { if (required) throw new Error(`Sheet "${tab}": anchor row "${after}" not found`); return null; }
    start = a + 1;
  }
  for (let i = start; i < grid.length; i++) {
    if (norm(grid[i]?.[0]) === norm(label)) return grid[i];
  }
  if (required) throw new Error(`Sheet "${tab}": row "${label}"${after ? ` (after "${after}")` : ''} not found`);
  return null;
}

// Month columns B..M (index 1..12) and Total column N (index 13).
export const months = (row) => Array.from({ length: 12 }, (_, i) => num(row?.[i + 1]));
export const total = (row) => num(row?.[13]);

export function requireNum(v, what) {
  if (v === null || v === undefined || Number.isNaN(v)) throw new Error(`Missing or non-numeric value: ${what}`);
  return v;
}

// Parse "11 Jan 2027", "1/12/2027", "2027-01-11" into YYYY-MM-DD (UTC) or null.
export function isoDate(s) {
  const t = clean(s);
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/);
  if (m) {
    const mi = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}
