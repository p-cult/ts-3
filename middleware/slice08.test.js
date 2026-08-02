'use strict';

/**
 * Slice 08 — Classifier / Logged / Make Task.
 */

const assert = require('assert');
const http = require('http');
const { startServer } = require('./server');
const {
  countsAsApproved,
  countsAsCompleted,
  countsAsLogged,
  isLoggedKind,
  isMakeTaskEligible,
} = require('./domain/classifier');

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

function request(port, method, pathName, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request(
      { hostname: '127.0.0.1', port, path: pathName, method, headers },
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
  assert.strictEqual(r.status, 200);
  return r.json;
}

async function main() {
  console.log('slice 08 tests\n');

  try {
    assert.strictEqual(isLoggedKind('routine'), true);
    assert.strictEqual(isLoggedKind('not_a_task'), true);
    assert.strictEqual(isLoggedKind('pseudo'), false);
    assert.strictEqual(countsAsLogged({ kind: 'routine' }), true);
    assert.strictEqual(
      countsAsApproved({ kind: 'main', reviewState: 'approved' }),
      true
    );
    assert.strictEqual(
      countsAsApproved({ kind: 'routine', reviewState: 'approved' }),
      false
    );
    assert.strictEqual(
      countsAsCompleted({ kind: 'main', status: 'Done' }),
      true
    );
    assert.strictEqual(
      countsAsCompleted({ kind: 'routine', status: 'Done' }),
      true
    );
    assert.strictEqual(
      countsAsCompleted({ kind: 'pseudo', status: 'Done' }),
      false
    );
    assert.strictEqual(isMakeTaskEligible({ kind: 'routine' }), true);
    ok('classifier pure helpers');
  } catch (e) {
    fail('classifier pure helpers', e);
  }

  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;

  try {
    const h = await request(port, 'GET', '/api/health');
    assert.strictEqual(h.json.slice, '13');
    ok('health slice 08');

    const admin = await login(port, 'ts3admin', 'ts3-98860');
    const mod = await login(port, 'mira', 'mira');
    const usr = await login(port, 'ts3usr1', 'ts3-98860');

    const routine = await request(port, 'POST', '/api/tasks', {
      token: admin.token,
      body: {
        projectCode: 'PRJ001',
        name: 'Logged Row ' + Date.now(),
        kind: 'routine',
        assigneeUsername: 'ts3usr1',
      },
    });
    assert.strictEqual(routine.status, 201);
    const rref = routine.json.task.ref;

    const active = await request(port, 'GET', '/api/tasks?board=active', {
      token: usr.token,
    });
    assert.ok(!active.json.tasks.some((t) => t.ref === rref));
    ok('active board hides logged kinds');

    const logged = await request(port, 'GET', '/api/tasks?board=logged', {
      token: usr.token,
    });
    assert.strictEqual(logged.status, 200);
    assert.ok(logged.json.tasks.some((t) => t.ref === rref));
    ok('board=logged for P2+');

    const pubLogged = await request(port, 'GET', '/api/tasks?board=logged');
    assert.strictEqual(pubLogged.status, 403);
    ok('logged tab requires sign-in');

    const mkFail = await request(port, 'POST', '/api/tasks/' + rref + '/make-task', {
      token: usr.token,
    });
    assert.strictEqual(mkFail.status, 403);
    ok('P2 cannot make task');

    const mk = await request(port, 'POST', '/api/tasks/' + rref + '/make-task', {
      token: mod.token,
    });
    assert.strictEqual(mk.status, 200, JSON.stringify(mk.json));
    assert.strictEqual(mk.json.task.kind, 'main');
    ok('P3 make-task promotes routine → main');

    const patch = await request(port, 'PATCH', '/api/tasks/' + rref, {
      token: mod.token,
      body: { kind: 'main' },
    });
    assert.strictEqual(patch.status, 403);
    ok('make-task already main — patch kind blocked for restricted-only path');

    const pseudo = await request(port, 'POST', '/api/tasks', {
      token: admin.token,
      body: {
        projectCode: 'PRJ001',
        name: 'Pseudo Promo ' + Date.now(),
        kind: 'pseudo',
        assigneeUsername: 'ts3usr1',
      },
    });
    assert.strictEqual(pseudo.status, 201);
    const pref = pseudo.json.task.ref;
    const mk2 = await request(port, 'PATCH', '/api/tasks/' + pref, {
      token: mod.token,
      body: { kind: 'main' },
    });
    assert.strictEqual(mk2.status, 200);
    assert.strictEqual(mk2.json.task.kind, 'main');
    ok('P3 PATCH kind=main on pseudo');
  } catch (e) {
    fail('classifier API flow', e);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
