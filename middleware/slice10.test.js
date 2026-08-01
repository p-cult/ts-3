'use strict';

/**
 * Slice 10 — Reports (read-only journey).
 */

const assert = require('assert');
const http = require('http');
const { startServer } = require('./server');

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
  console.log('slice 10 tests\n');

  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  if (server.app.data._side && typeof server.app.data._side._reset === 'function') {
    server.app.data._side._reset();
  }

  try {
    const h = await request(port, 'GET', '/api/health');
    assert.strictEqual(h.json.slice, '12');
    ok('health slice 10');

    const list = await request(port, 'GET', '/api/tasks');
    const ref = list.json.tasks[0].ref;

    const p2 = await login(port, 'ts3usr1', 'ts3-98860');
    const deny = await request(port, 'GET', '/api/reports/journey?ref=' + ref, {
      token: p2.token,
    });
    assert.strictEqual(deny.status, 403);
    ok('P2 cannot load journey report');

    const mod = await login(port, 'mira', 'mira');
    const row = server.app.data.findByRef(ref);
    server.app.data.setStages(row.taskId, {
      tokens: ['#a', '#b'],
      currentIndex: 1,
    });
    server.app.data.appendReview(row.taskId, {
      action: 'feedback',
      notes: 'check',
      at: new Date().toISOString(),
      byUsername: 'mira',
    });

    const r = await request(port, 'GET', '/api/reports/journey?ref=' + ref, {
      token: mod.token,
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.ref, ref);
    assert.ok(r.json.task && r.json.task.ref === ref);
    assert.ok(r.json.journey && r.json.journey.name);
    assert.ok(Array.isArray(r.json.journey.reviewHistory));
    assert.ok(r.json.journey.reviewHistory.length >= 1);
    assert.ok(r.json.journey.stages && r.json.journey.stages.tokens.length === 2);
    ok('P3 journey joins visible + side history');
  } catch (e) {
    fail('journey report', e);
  } finally {
    await new Promise((res) => server.close(res));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
