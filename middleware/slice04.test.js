'use strict';

/**
 * Slice 04 tests — board UX polish (stages parse + kind gates stay green).
 */

const http = require('http');
const assert = require('assert');
const { startServer } = require('./server');
const { parseStageTokens } = require('./domain/stages');

let passed = 0;
let failed = 0;
function ok(n) {
  passed += 1;
  console.log('  ok  — ' + n);
}
function fail(n, e) {
  failed += 1;
  console.error('  FAIL — ' + n, e && e.message ? e.message : e);
}

function request(port, method, path, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            /* */
          }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(port, u, p) {
  const r = await request(port, 'POST', '/api/login', {
    body: { username: u, password: p },
  });
  assert.strictEqual(r.status, 200, 'login ' + u);
  return r.json;
}

async function main() {
  console.log('slice 04 tests\n');

  try {
    const spaced = parseStageTokens('# tak');
    assert.strictEqual(spaced.ok, false);
    assert.ok(/no spaces after #/i.test(spaced.error));
    ok('parse: "# tak" clear error');
  } catch (e) {
    fail('parse # tak', e);
  }

  try {
    const bare = parseStageTokens('#');
    assert.strictEqual(bare.ok, false);
    assert.ok(/#/.test(bare.error));
    ok('parse: lone "#" clear error');
  } catch (e) {
    fail('parse lone #', e);
  }

  try {
    const trail = parseStageTokens('#design #');
    assert.strictEqual(trail.ok, false);
    assert.ok(/trailing|incomplete|#/i.test(trail.error), trail.error);
    ok('parse: trailing "#design #" clear error');
  } catch (e) {
    fail('parse trailing #', e);
  }

  try {
    const arr = parseStageTokens(['#ok', '#']);
    assert.strictEqual(arr.ok, false);
    ok('parse: array with lone # fails');
  } catch (e) {
    fail('parse array lone #', e);
  }

  try {
    const good = parseStageTokens('#Design #Build #Ship');
    assert.strictEqual(good.ok, true);
    assert.deepStrictEqual(good.tokens, ['#Design', '#Build', '#Ship']);
    ok('parse: good tokens');
  } catch (e) {
    fail('parse good', e);
  }

  try {
    // never throws on garbage
    const junk = parseStageTokens({ weird: true });
    assert.strictEqual(typeof junk.ok, 'boolean');
    ok('parse: never throws on non-string');
  } catch (e) {
    fail('parse never throws', e);
  }

  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  const app = server.app;
  if (app.data._side && typeof app.data._side._reset === 'function') {
    app.data._side._reset();
  }

  try {
    {
      const r = await request(port, 'GET', '/api/health');
      assert.strictEqual(r.json.slice, '04');
    }
    ok('health slice 04');

    const admin = await login(port, 'ts3admin', 'ts3-98860');
    const token = admin.token;

    const created = await request(port, 'POST', '/api/tasks', {
      token,
      body: { projectCode: 'PRJ001', name: 'Slice04 Stages ' + Date.now() },
    });
    assert.ok(created.status === 201, JSON.stringify(created.json));
    const ref = created.json.task.ref;

    const bad = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(ref) + '/stages', {
      token,
      body: { text: '#design #' },
    });
    assert.strictEqual(bad.status, 400);
    assert.ok(bad.json && /#|stage/i.test(JSON.stringify(bad.json)));
    ok('API stages rejects trailing broken token');

    const bad2 = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(ref) + '/stages', {
      token,
      body: { text: '# tak' },
    });
    assert.strictEqual(bad2.status, 400);
    ok('API stages rejects "# tak"');

    const good = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(ref) + '/stages', {
      token,
      body: { text: '#design #build', currentIndex: 1 },
    });
    assert.strictEqual(good.status, 200);
    assert.deepStrictEqual(good.json.stages.tokens, ['#design', '#build']);
    ok('API stages accepts chip-ready tokens');

    // Kind-aware: create pseudo → status-only still patchable
    const pseudo = await request(port, 'POST', '/api/tasks', {
      token,
      body: {
        projectCode: 'PRJ001',
        name: 'Slice04 Pseudo ' + Date.now(),
        kind: 'pseudo',
      },
    });
    assert.strictEqual(pseudo.status, 201);
    assert.strictEqual(pseudo.json.task.kind, 'pseudo');
    const pref = pseudo.json.task.ref;
    const st = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(pref), {
      token,
      body: { status: 'Pause' },
    });
    assert.strictEqual(st.status, 200);
    assert.strictEqual(st.json.task.status, 'Pause');
    ok('pseudo kind accepts status patch');

    // P2 create → Active; Pause/Resume/Done only
    const p2 = await login(port, 'ts3usr1', 'ts3-98860');
    const p2t = await request(port, 'POST', '/api/tasks', {
      token: p2.token,
      body: { projectCode: 'PRJ001', name: 'Slice04 P2 ' + Date.now() },
    });
    assert.strictEqual(p2t.status, 201);
    assert.strictEqual(p2t.json.task.status, 'Active');
    const pref2 = p2t.json.task.ref;
    const deny = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(pref2), {
      token: p2.token,
      body: { status: 'Draft' },
    });
    assert.strictEqual(deny.status, 403);
    const pause = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(pref2), {
      token: p2.token,
      body: { status: 'Pause' },
    });
    assert.strictEqual(pause.status, 200);
    ok('P2 status: create→Active; Draft denied; Pause ok');
  } catch (e) {
    fail('http polish', e);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
