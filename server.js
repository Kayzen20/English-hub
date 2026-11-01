// EnglishHub backend — tanpa dependensi eksternal (hanya modul bawaan Node.js >= 22.13)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'englishhub.db');
const TZ = process.env.APP_TZ || 'Asia/Jakarta';
const PUBLIC = path.join(__dirname, 'public');
const WORDS = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'words.json'), 'utf8')));
const LEVELS = [[0, 'A1', 'Beginner'], [300, 'A2', 'Elementary'], [600, 'B1', 'Intermediate'], [1600, 'B2', 'Upper-Intermediate']];
const RATE = Number(process.env.RATE_LIMIT) || 10;
const QUIZ_SIZE = 5, QUIZ_COOLDOWN_MS = 15000, DAILY_XP_CAP = 1000;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const SECRET = process.env.SECRET || (() => {
  const f = path.join(path.dirname(DB_PATH), 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8');
})();

// ---------- Database ----------
const db = new DatabaseSync(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  salt TEXT NOT NULL, hash TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  quizzes INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 1,
  last_day TEXT NOT NULL DEFAULT '',
  last_quiz_at INTEGER NOT NULL DEFAULT 0,
  xp_day TEXT NOT NULL DEFAULT '', xp_today INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_words(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL, PRIMARY KEY(user_id, word)
);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
`);
for (const [col, def] of [['rec_salt', "TEXT NOT NULL DEFAULT ''"], ['rec_hash', "TEXT NOT NULL DEFAULT ''"], ['tv', 'INTEGER NOT NULL DEFAULT 0']]) {
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
}
const q = {
  byName: db.prepare('SELECT * FROM users WHERE username = ?'),
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  insert: db.prepare('INSERT INTO users(username,salt,hash,created_at,last_day,rec_salt,rec_hash) VALUES(?,?,?,?,?,?,?)'),
  setPw: db.prepare('UPDATE users SET salt=?, hash=?, tv=tv+1 WHERE id=?'),
  setRec: db.prepare('UPDATE users SET rec_salt=?, rec_hash=? WHERE id=?'),
  words: db.prepare('SELECT word FROM user_words WHERE user_id = ? ORDER BY rowid'),
  addWord: db.prepare('INSERT OR IGNORE INTO user_words(user_id,word) VALUES(?,?)'),
  setStreak: db.prepare('UPDATE users SET streak=?, last_day=? WHERE id=?'),
  addXp: db.prepare('UPDATE users SET xp=xp+?, xp_day=?, xp_today=? WHERE id=?'),
  quiz: db.prepare('UPDATE users SET quizzes=quizzes+1, last_quiz_at=? WHERE id=?'),
  board: db.prepare(`SELECT u.username, u.xp, u.quizzes, u.streak,
    (SELECT COUNT(*) FROM user_words w WHERE w.user_id=u.id) AS words
    FROM users u ORDER BY u.xp DESC, u.created_at ASC LIMIT 20`),
};

// ---------- Helpers ----------
const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const levelOf = xp => LEVELS.reduce((l, v) => (xp >= v[0] ? v : l), LEVELS[0]);
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sameHex = (a, b) => a.length === b.length && a.length > 0 && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const checkPw = (u, pw) => !!u && sameHex(hashPw(pw, u.salt), u.hash);
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecovery() { // kode pemulihan 16 karakter, mis. K7QF-2M9X-PD4A-WZ3H
  const raw = Array.from({ length: 16 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');
  const salt = crypto.randomBytes(16).toString('hex');
  return { code: raw.match(/.{4}/g).join('-'), salt, hash: hashPw(raw, salt) };
}
const checkRecovery = (u, code) => !!u && sameHex(hashPw(normCode(code), u.rec_salt || 'x'), u.rec_hash);
const validPw = p => typeof p === 'string' && p.length >= 6 && p.length <= 100;
const b64 = b => Buffer.from(b).toString('base64url');
function sign(uid, tv = 0) {
  const body = b64(JSON.stringify({ uid, tv, exp: Date.now() + 30 * 86400e3 }));
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function verify(tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url')); return p.exp > Date.now() ? p : null; } catch { return null; }
}
function touchStreak(u) {
  const today = dayKey();
  if (u.last_day === today) return u;
  const y = dayKey(new Date(Date.now() - 86400e3));
  const streak = u.last_day === y ? u.streak + 1 : 1;
  q.setStreak.run(streak, today, u.id);
  return q.byId.get(u.id);
}
function state(u) {
  const [min, level, levelName] = levelOf(u.xp);
  return { user: { username: u.username }, progress: { xp: u.xp, quizzes: u.quizzes, streak: u.streak, level, levelName,
    words: q.words.all(u.id).map(r => r.word) } };
}
function grantXp(u, amount) {
  const today = dayKey();
  const used = u.xp_day === today ? u.xp_today : 0;
  const give = Math.max(0, Math.min(amount, DAILY_XP_CAP - used));
  q.addXp.run(give, today, used + give, u.id);
  return give;
}
const hits = new Map(); // rate limit login/register per IP
function limited(ip, max = RATE, windowMs = 60000) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < windowMs);
  h.push(now); hits.set(ip, h); return h.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 60000)) hits.delete(k); }, 60000).unref();

const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const fail = (res, code, msg) => send(res, code, { error: msg });
function readJson(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 10240) { reject(new Error('big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('json')); } });
    req.on('error', reject);
  });
}
const authUser = req => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  const p = m && verify(m[1]);
  const u = p && q.byId.get(p.uid);
  return u && (u.tv || 0) === (p.tv || 0) ? u : null;
};

// ---------- API ----------
async function api(req, res, url) {
  const ip = (process.env.TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress || 'x';
  const route = req.method + ' ' + url.pathname;

  if (route === 'POST /api/register' || route === 'POST /api/login') {
    if (limited(ip)) return fail(res, 429, 'Terlalu banyak percobaan. Coba lagi sebentar lagi.');
    const { username, password } = await readJson(req);
    if (typeof username !== 'string' || typeof password !== 'string') return fail(res, 400, 'Data tidak valid.');
    if (route === 'POST /api/register') {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail(res, 400, 'Username 3–20 karakter: huruf, angka, atau _.');
      if (password.length < 6 || password.length > 100) return fail(res, 400, 'Password minimal 6 karakter.');
      if (q.byName.get(username)) return fail(res, 409, 'Username sudah dipakai.');
      const salt = crypto.randomBytes(16).toString('hex');
      const rec = newRecovery();
      const r = q.insert.run(username, salt, hashPw(password, salt), Date.now(), dayKey(), rec.salt, rec.hash);
      const u = q.byId.get(Number(r.lastInsertRowid));
      return send(res, 201, { token: sign(u.id, u.tv), recovery: rec.code, ...state(u) });
    }
    const u = q.byName.get(username);
    if (!checkPw(u, password)) return fail(res, 401, 'Username atau password salah.');
    return send(res, 200, { token: sign(u.id, u.tv), ...state(touchStreak(u)) });
  }

  if (route === 'POST /api/reset') { // lupa password: pakai kode pemulihan
    if (limited(ip)) return fail(res, 429, 'Terlalu banyak percobaan. Coba lagi sebentar lagi.');
    const { username, code, newPassword } = await readJson(req);
    if (!validPw(newPassword)) return fail(res, 400, 'Password baru minimal 6 karakter.');
    const u = typeof username === 'string' ? q.byName.get(username) : null;
    if (!checkRecovery(u, code)) return fail(res, 403, 'Username atau kode pemulihan salah.');
    const salt = crypto.randomBytes(16).toString('hex'), rec = newRecovery();
    q.setPw.run(salt, hashPw(newPassword, salt), u.id); q.setRec.run(rec.salt, rec.hash, u.id);
    const nu = q.byId.get(u.id);
    return send(res, 200, { token: sign(nu.id, nu.tv), recovery: rec.code, ...state(touchStreak(nu)) });
  }

  if (route === 'GET /api/leaderboard') return send(res, 200, { rows: q.board.all() });

  let u = authUser(req);
  if (!u) return fail(res, 401, 'Silakan masuk terlebih dahulu.');

  if (route === 'GET /api/me') return send(res, 200, state(touchStreak(u)));

  if (route === 'POST /api/password') { // ganti password saat sudah masuk
    if (limited(ip + ':pw')) return fail(res, 429, 'Terlalu banyak percobaan. Coba lagi sebentar lagi.');
    const { oldPassword, newPassword } = await readJson(req);
    if (!checkPw(u, String(oldPassword || ''))) return fail(res, 403, 'Password lama salah.');
    if (!validPw(newPassword)) return fail(res, 400, 'Password baru minimal 6 karakter.');
    const salt = crypto.randomBytes(16).toString('hex');
    q.setPw.run(salt, hashPw(newPassword, salt), u.id);
    const nu = q.byId.get(u.id);
    return send(res, 200, { token: sign(nu.id, nu.tv) });
  }

  if (route === 'POST /api/recovery') { // buat kode pemulihan baru (kode lama tidak berlaku lagi)
    if (limited(ip + ':pw')) return fail(res, 429, 'Terlalu banyak percobaan. Coba lagi sebentar lagi.');
    const { password } = await readJson(req);
    if (!checkPw(u, String(password || ''))) return fail(res, 403, 'Password salah.');
    const rec = newRecovery(); q.setRec.run(rec.salt, rec.hash, u.id);
    return send(res, 200, { recovery: rec.code });
  }

  if (route === 'POST /api/event') {
    const ev = await readJson(req);
    u = touchStreak(u);
    let gained = 0;
    if (ev.type === 'word') {
      if (!WORDS.has(ev.word)) return fail(res, 400, 'Kata tidak dikenal.');
      if (q.addWord.run(u.id, ev.word).changes) gained = grantXp(u, 5);
    } else if (ev.type === 'quiz') {
      const c = ev.correct;
      if (!Number.isInteger(c) || c < 0 || c > QUIZ_SIZE) return fail(res, 400, 'Skor tidak valid.');
      if (Date.now() - u.last_quiz_at < QUIZ_COOLDOWN_MS) return fail(res, 429, 'Tunggu sebentar sebelum kuis berikutnya.');
      q.quiz.run(Date.now(), u.id);
      gained = grantXp(u, c * 10);
    } else return fail(res, 400, 'Jenis event tidak dikenal.');
    return send(res, 200, { gained, ...state(q.byId.get(u.id)) });
  }
  return fail(res, 404, 'Endpoint tidak ditemukan.');
}

// ---------- Static files ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, url) {
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.end();
    fail(res, e.message === 'json' || e.message === 'big' ? 400 : 500, e.message === 'json' || e.message === 'big' ? 'Permintaan tidak valid.' : 'Kesalahan server.');
    if (!['json', 'big'].includes(e.message)) console.error(e);
  }
});
if (require.main === module) server.listen(PORT, () => console.log(`EnglishHub berjalan di http://localhost:${PORT}`));
module.exports = server;
