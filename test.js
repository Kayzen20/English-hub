// Tes otomatis: node test.js
const assert = require('node:assert/strict');
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
process.env.RATE_LIMIT = '1000';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eh-')), 'test.db');
const server = require('./server');
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const call = async (p, body, token) => {
    const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body && JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  let r = await call('/api/register', { username: 'shandy', password: 'rahasia123' });
  assert.equal(r.status, 201); assert.match(r.json.recovery, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/); let rec = r.json.recovery; const t = r.json.token; assert.equal(r.json.progress.xp, 0);
  assert.equal((await call('/api/register', { username: 'SHANDY', password: 'rahasia123' })).status, 409);
  assert.equal((await call('/api/register', { username: 'a', password: 'rahasia123' })).status, 400);
  assert.equal((await call('/api/register', { username: 'budi', password: '123' })).status, 400);
  assert.equal((await call('/api/login', { username: 'shandy', password: 'salah' })).status, 401);
  assert.equal((await call('/api/login', { username: 'shandy', password: 'rahasia123' })).status, 200);
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/me', null, t + 'x')).status, 401);
  r = await call('/api/event', { type: 'word', word: 'Always', mode: 'spoken' }, t); assert.equal(r.json.gained, 5);
  r = await call('/api/event', { type: 'word', word: 'Always' }, t); assert.equal(r.json.gained, 0);
  assert.equal((await call('/api/event', { type: 'word', word: 'Hack' }, t)).status, 400);
  assert.equal((await call('/api/event', { type: 'quiz', correct: 99 }, t)).status, 400);
  r = await call('/api/event', { type: 'quiz', correct: 4 }, t); assert.equal(r.json.gained, 40); assert.equal(r.json.progress.xp, 45);
  assert.equal((await call('/api/event', { type: 'quiz', correct: 5 }, t)).status, 429); // cooldown anti-spam
  r = await call('/api/words'); assert.ok(r.json.words.length >= 100); assert.equal(r.json.words[0].length, 5);
  r = await call('/api/register', { username: 'budi', password: 'rahasia123' });
  r = await call('/api/event', { type: 'word', word: 'Rice' }, r.json.token); assert.equal(r.json.gained, 2); // manual
  r = await call('/api/leaderboard'); assert.equal(r.json.rows[0].username, 'shandy'); assert.equal(r.json.rows[0].xp, 45); assert.equal(r.json.rows.length, 2);
  r = await fetch(base + '/'); assert.equal(r.status, 200); assert.match(await r.text(), /EnglishHub/);
  assert.equal((await fetch(base + '/..%2fserver.js')).status === 200, false);
  assert.equal(await (await fetch(base + '/healthz')).text(), 'ok');
  // --- level: Intermediate terkunci sampai semua kata Beginner dikuasai ---
  const all = (await call('/api/words')).json.words, beg = all.filter(w => w[4] === 'beginner').map(w => w[0]), inter = all.find(w => w[4] === 'intermediate')[0];
  assert.ok(beg.length >= 100 && all.length >= 180);
  assert.equal((await call('/api/event', { type: 'word', word: inter, mode: 'spoken' }, t)).status, 403);
  for (const w of beg) await call('/api/event', { type: 'word', word: w, mode: 'spoken' }, t);
  r = await call('/api/event', { type: 'word', word: inter, mode: 'spoken' }, t); assert.equal(r.status, 200);
  // --- fungsi serverless Vercel (handler api/[...path].js) memakai logika yang sama ---
  const vercel = require('./api/[...path].js');
  const fake = (method, url, body) => new Promise(resolve => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { resolve({ status: this.statusCode, json: JSON.parse(b) }) } }; vercel({ method, url, headers: { 'x-forwarded-for': '1.2.3.4' }, body, socket: {} }, res); });
  r = await fake('POST', '/api/login', { username: 'budi', password: 'rahasia123' }); assert.equal(r.status, 200);
  r = await fake('GET', '/api/leaderboard'); assert.equal(r.status, 200); assert.ok(r.json.rows.length >= 2);
  assert.equal((await fake('GET', '/api/me')).status, 401);
  const xpBefore = (await call('/api/me', null, t)).json.progress.xp;
  // --- reset & ganti password ---
  assert.equal((await call('/api/reset', { username: 'shandy', code: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'barubaru1' })).status, 403);
  assert.equal((await call('/api/reset', { username: 'tidakada', code: rec, newPassword: 'barubaru1' })).status, 403);
  assert.equal((await call('/api/reset', { username: 'shandy', code: rec, newPassword: '123' })).status, 400);
  r = await call('/api/reset', { username: 'shandy', code: rec.toLowerCase().replaceAll('-', ' '), newPassword: 'barubaru1' });
  assert.equal(r.status, 200); assert.equal(r.json.progress.xp, xpBefore); assert.notEqual(r.json.recovery, rec);
  assert.equal((await call('/api/me', null, t)).status, 401);            // token lama dicabut
  assert.equal((await call('/api/login', { username: 'shandy', password: 'rahasia123' })).status, 401);
  assert.equal((await call('/api/reset', { username: 'shandy', code: rec, newPassword: 'x12345' })).status, 403); // kode lama hangus
  r = await call('/api/login', { username: 'shandy', password: 'barubaru1' }); assert.equal(r.status, 200); const t2 = r.json.token;
  assert.equal((await call('/api/password', { oldPassword: 'salah', newPassword: 'ganti1234' }, t2)).status, 403);
  r = await call('/api/password', { oldPassword: 'barubaru1', newPassword: 'ganti1234' }, t2); assert.equal(r.status, 200);
  assert.equal((await call('/api/me', null, t2)).status, 401);
  assert.equal((await call('/api/me', null, r.json.token)).status, 200);
  r = await call('/api/recovery', { password: 'ganti1234' }, r.json.token); assert.match(r.json.recovery, /^[A-Z0-9-]{19}$/);
  console.log('Semua tes lulus ✅'); server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
