'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const COOKIE = 'huiyan_native_access';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const requestScope = new AsyncLocalStorage();
const paidHttpPaths = new Set(['/api/realtime/sdp', '/api/vision-check',
  '/api/speed-vision-answer']);
const paidSocketPaths = new Set(['/api/ws', '/api/realtime/ws']);

function createClientAccessPolicy({ root, now = Date.now, config: suppliedConfig } = {}) {
  const configPath = path.join(root || process.cwd(), 'private-client-access', 'config.json');
  const attempts = new Map();
  function config() {
    if (suppliedConfig) return suppliedConfig;
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch (_) { return {}; }
  }
  function profile(req) {
    const settings = config();
    const cookie = String(req.headers?.cookie || '').split(';').map(x => x.trim())
      .find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!settings.secret || !cookie || cookie.length > 600 || !/^[\w-]+\.[a-f0-9]{64}$/.test(cookie)) return 'web';
    const [payload, signature] = cookie.split('.');
    const expected = crypto.createHmac('sha256', settings.secret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return 'web';
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return data.role === 'native' && data.exp > now() && data.revision === (settings.revision || 1) ? 'native' : 'web';
    } catch (_) { return 'web'; }
  }
  function capabilities(req) {
    const accessProfile = profile(req);
    return { accessProfile, nativeAuthorized: accessProfile === 'native',
      paidVoiceAllowed: accessProfile === 'native', browserApiKeysAllowed: accessProfile === 'native',
      teachingAvailable: false };
  }
  function assertHttp(req, url) {
    if (profile(req) === 'web' && paidHttpPaths.has(url.pathname)) {
      throw Object.assign(new Error('网页版不使用阿里付费服务，请使用谷歌慧眼。'), { statusCode: 403 });
    }
  }
  function socketAllowed(req, url) {
    return !paidSocketPaths.has(url.pathname) || profile(req) === 'native';
  }
  function run(req, callback) { return requestScope.run({ profile: profile(req) }, callback); }
  async function handle(req, res, url, { readJsonBody, sendJson }) {
    if (url.pathname !== '/api/client-access') return false;
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') { sendJson(res, 200, { ok: true, ...capabilities(req) }); return true; }
    if (req.method !== 'POST') { sendJson(res, 405, { ok: false }); return true; }
    if (req.headers.origin) {
      let sameOrigin = false;
      try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch (_) {}
      if (!sameOrigin) { sendJson(res, 403, { ok: false, error: '请在当前应用内完成授权。' }); return true; }
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') { sendJson(res, 403, { ok: false }); return true; }
    const body = await readJsonBody(req, 2048);
    const credential = String(body?.nativeCredential || '').trim();
    const settings = config();
    if (!/^[a-f0-9]{64}$/.test(credential) || !settings.secret || !settings.nativeCredentialHash
      || hash(credential) !== settings.nativeCredentialHash) {
      const minute = Math.floor(now() / 900000);
      if (attempts.get('_window') !== minute) { attempts.clear(); attempts.set('_window', minute); }
      const ip = String(req.socket?.remoteAddress || 'unknown');
      const count = (attempts.get(ip) || 0) + 1;
      if (attempts.size >= 300 || count > 8) {
        res.setHeader('Retry-After', '900'); sendJson(res, 429, { ok: false, error: '授权尝试过多，请稍后再试。' }); return true;
      }
      attempts.set(ip, count);
      sendJson(res, 401, { ok: false, error: '苹果权限验证失败，请更新已授权的安装包。' }); return true;
    }
    const duration = 90 * 86400000;
    const payload = Buffer.from(JSON.stringify({ role: 'native', exp: now() + duration, revision: settings.revision || 1 })).toString('base64url');
    const signature = crypto.createHmac('sha256', settings.secret).update(payload).digest('hex');
    res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${signature}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${duration / 1000}`);
    if (!suppliedConfig && root) {
      try {
        const folder = path.join(root, 'logs', 'client-access');
        fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
        fs.appendFileSync(path.join(folder, 'events.jsonl'), JSON.stringify({
          receivedAt: new Date(now()).toISOString(), event: 'native_authorized',
          appleNetworkClient: /CFNetwork.*Darwin/.test(String(req.headers['user-agent'] || ''))
        }) + '\n', { encoding: 'utf8', mode: 0o600 });
      } catch (_) { /* A diagnostic write cannot invalidate a successful enrollment. */ }
    }
    sendJson(res, 200, { ok: true, accessProfile: 'native' }); return true;
  }
  return { profile, capabilities, assertHttp, socketAllowed, run, handle };
}

function webRequest() { return requestScope.getStore()?.profile === 'web'; }
module.exports = { createClientAccessPolicy, webRequest, COOKIE };
