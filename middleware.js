// Server-side password gate (Vercel Routing Middleware). Runs before any file is served,
// so the dashboard HTML and its numbers never leave Vercel without the password.
//
// Vercel environment variables (Production):
//   DASHBOARD_PASSWORD_HASH  SHA-256 hex of the password (same hash the old page used)
//   SESSION_SECRET           long random string; changing it signs everyone out
// If either is missing the site stays locked (fails closed).
import { next } from '@vercel/functions';

export const config = { matcher: ['/((?!version\\.txt$).*)'] };

const COOKIE = 'tct_session';
const DAYS = 30;
const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function readCookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
async function validSession(req, secret) {
  const v = readCookie(req, COOKIE);
  if (!v) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

const page = (error = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>TCT Commercial Dashboard</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E1E35;font-family:Inter,system-ui,sans-serif}
form{background:#1a2e4a;border-radius:14px;padding:40px 48px;text-align:center;width:90%;max-width:400px;box-sizing:border-box}
img{height:36px;margin:0 auto 28px;display:block}p{color:rgba(255,255,255,.7);font-size:13px;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:11px 14px;border-radius:8px;border:1.5px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;font-size:15px;outline:none;margin-bottom:12px;letter-spacing:.05em}
button{width:100%;padding:11px;border-radius:8px;background:#1B6CA8;color:#fff;font-size:15px;font-weight:600;border:none;cursor:pointer}
.err{color:#f87171;font-size:12px;margin:12px 0 0}@media(max-width:420px){form{padding:32px 24px}}</style></head><body>
<form method="post" action="/__login">
<img src="https://www.tomschristiantours.com/logo-white.webp" alt="TCT" onerror="this.style.display='none'">
<p>Tom's Christian Tours · Commercial Dashboard</p>
<input name="password" type="password" placeholder="Enter password" autocomplete="current-password" autofocus required>
<button type="submit">Unlock</button>${error ? `<p class="err">${error}</p>` : ''}</form></body></html>`;

const html = (body, status) => new Response(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
});

export default async function middleware(req) {
  const hash = (process.env.DASHBOARD_PASSWORD_HASH || '').trim().toLowerCase();
  const secret = process.env.SESSION_SECRET || '';
  if (!/^[0-9a-f]{64}$/.test(hash) || secret.length < 32) {
    return new Response('Dashboard is locked: password settings are missing on the server.', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  const url = new URL(req.url);

  if (url.pathname === '/__logout') {
    return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }

  if (url.pathname === '/__login' && req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const pw = String(form?.get('password') || '');
    if (!pw || !safeEqual(await sha256(pw), hash)) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return html(page('Incorrect password. Please try again.'), 401);
    }
    const exp = String(Date.now() + DAYS * 86400000);
    const cookie = `${COOKIE}=${exp}.${await hmac(secret, exp)}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
    return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': cookie, 'cache-control': 'no-store' } });
  }

  if (await validSession(req, secret)) {
    return next({ headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });
  }
  return html(page(), 401);
}
