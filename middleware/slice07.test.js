'use strict';

/**
 * Slice 07 — Queue (draft → decide → birth).
 */

const assert = require('assert');
const http = require('http');
const { startServer } = require('./server');
const { createApp } = require('./app');
const { config: baseConfig } = require('./config');

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
  console.log('slice 07 tests\n');

  const app = createApp({
    config: {
      ...baseConfig,
      queueMode: 'on',
      appMode: 'staging',
      storeAdapter: 'memory',
      isDev: true,
      isProd: false,
    },
  });
  if (app.data._queue) app.data._queue._reset();
  const server = await startServer({ app, host: '127.0.0.1', port: 0 });
  const port = server.address().port;

  try {
    const h = await request(port, 'GET', '/api/health');
    assert.strictEqual(h.json.slice, '07');
    assert.strictEqual(h.json.mode.queueMode, 'on');
    ok('health queueMode on');

    const p2 = await login(port, 'ts3usr1', 'ts3-98860');
    const name = 'Queue Draft ' + Date.now();
    const idsBefore = app.data.allTaskIds().slice();

    const enq = await request(port, 'POST', '/api/tasks', {
      token: p2.token,
      body: { projectCode: 'PRJ001', name },
    });
    assert.strictEqual(enq.status, 202, JSON.stringify(enq.json));
    assert.strictEqual(enq.json.queued, true);
    assert.ok(enq.json.queueId);
    assert.ok(!enq.json.task);
    assert.deepStrictEqual(app.data.allTaskIds(), idsBefore);
    ok('P2 enqueue — no mint, no task');

    const qid = enq.json.queueId;
    const listP2 = await request(port, 'GET', '/api/queue', { token: p2.token });
    assert.strictEqual(listP2.status, 403);
    ok('P2 cannot list queue');

    const admin = await login(port, 'ts3admin', 'ts3-98860');
    const list = await request(port, 'GET', '/api/queue', { token: admin.token });
    assert.strictEqual(list.status, 200);
    assert.ok((list.json.queue || []).some((x) => x.queueId === qid));
    ok('P4 lists pending queue');

    const appr = await request(port, 'POST', '/api/queue/' + qid + '/approve', {
      token: admin.token,
    });
    assert.strictEqual(appr.status, 200, JSON.stringify(appr.json));
    assert.ok(appr.json.task && appr.json.task.ref);
    assert.ok(!appr.json.task.taskId);
    assert.ok(app.data.allTaskIds().length === idsBefore.length + 1);
    ok('approve → birth via one hallway');

    // duplicate on second approve of same name via new enqueue
    const enq2 = await request(port, 'POST', '/api/tasks', {
      token: p2.token,
      body: { projectCode: 'PRJ001', name },
    });
    assert.strictEqual(enq2.status, 202);
    const dup = await request(port, 'POST', '/api/queue/' + enq2.json.queueId + '/approve', {
      token: admin.token,
    });
    assert.strictEqual(dup.status, 409, JSON.stringify(dup.json));
    ok('approve duplicate identity → 409');

    const enq3 = await request(port, 'POST', '/api/tasks', {
      token: p2.token,
      body: { projectCode: 'PRJ001', name: 'Reject Me ' + Date.now() },
    });
    const rej = await request(port, 'POST', '/api/queue/' + enq3.json.queueId + '/reject', {
      token: admin.token,
      body: { reason: 'nope' },
    });
    assert.strictEqual(rej.status, 200);
    assert.strictEqual(rej.json.rejected, true);
    ok('reject discards without mint');

    // P4 still births direct when queue on
    const direct = await request(port, 'POST', '/api/tasks', {
      token: admin.token,
      body: { projectCode: 'PRJ001', name: 'Admin Direct ' + Date.now() },
    });
    assert.strictEqual(direct.status, 201);
    assert.ok(direct.json.task && direct.json.task.ref);
    ok('P4 still creates direct with QUEUE_MODE=on');
  } catch (e) {
    fail('queue flow', e);
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
