'use strict';

/**
 * Slice 05 — Google spine read path (fixture + write gate).
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const { startServer } = require('./server');
const { createApp } = require('./app');
const { config: baseConfig } = require('./config');
const { createSheetsData } = require('./data/sheets');
const { createBridgeClient } = require('./bridge/client');

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
  assert.strictEqual(r.status, 200, 'login ' + u);
  return r.json;
}

async function main() {
  console.log('slice 05 tests\n');

  try {
    const sheets = createSheetsData({
      stagingWrites: false,
      useLiveBridge: false,
      fixturePath: path.join(__dirname, 'data', 'fixtures', 'sheets-depot.json'),
    });
    assert.strictEqual(sheets.kind, 'sheets');
    const depot = sheets.listDepot();
    assert.ok(depot.some((t) => t.name === 'Sheets Fixture Read Task'));
    assert.throws(
      () =>
        sheets.commitBirth({
          taskId: 'PRJ0019001Z01',
          name: 'x',
          userSheet: 'u',
          status: 'Active',
          assigneeUsername: 'ts3admin',
        }),
      (err) => err && /STAGING_WRITES/i.test(err.message)
    );
    ok('sheets fixture lists tasks; writes refused');
  } catch (e) {
    fail('sheets unit', e);
  }

  try {
    let calls = 0;
    const bridge = createBridgeClient({
      bridgeUrl: 'https://example.test/bridge',
      bridgeSecret: 'secret',
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ ok: true, action: 'ping' });
          },
        };
      },
    });
    assert.strictEqual(bridge.configured, true);
    const ping = await bridge.ping();
    assert.strictEqual(ping.ok, true);
    assert.ok(calls >= 1);
    ok('bridge client ping via mock fetch');
  } catch (e) {
    fail('bridge client', e);
  }

  try {
    const sheets = createSheetsData({
      stagingWrites: true,
      writerOfRecord: 'ts3',
      appMode: 'staging',
      useLiveBridge: false,
      fixturePath: path.join(__dirname, 'data', 'fixtures', 'sheets-depot.json'),
    });
    const row = sheets.commitBirth({
      taskId: 'PRJ0029001A01',
      projectCode: 'PRJ002',
      projectName: 'Other Project',
      name: 'Staging Write Mirror',
      status: 'Active',
      assigneeUsername: 'ts3admin',
      userSheet: 'user-ts3admin',
      kind: 'main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.strictEqual(row.taskId, 'PRJ0029001A01');
    ok('sheets allows write only when STAGING_WRITES=true');
  } catch (e) {
    fail('staging writes on', e);
  }

  const memServer = await startServer({ host: '127.0.0.1', port: 0 });
  const memPort = memServer.address().port;
  try {
    const h = await request(memPort, 'GET', '/api/health');
    assert.strictEqual(h.json.slice, '08');
    assert.strictEqual(h.json.mode.storeAdapter, 'memory');
    assert.strictEqual(h.json.mode.stagingWrites, false);
    assert.strictEqual(h.json.dependencies.bridge.state, 'disabled');
    ok('default memory health slice 07');

    const admin = await login(memPort, 'ts3admin', 'ts3-98860');
    const list = await request(memPort, 'GET', '/api/tasks', { token: admin.token });
    assert.strictEqual(list.status, 200);
    assert.ok(Array.isArray(list.json.tasks));
    ok('memory list tasks still works');
  } catch (e) {
    fail('memory http', e);
  } finally {
    await new Promise((r) => memServer.close(r));
  }

  const sheetsApp = createApp({
    config: {
      ...baseConfig,
      storeAdapter: 'sheets',
      stagingWrites: false,
      useLiveBridge: false,
      appMode: 'staging',
      isDev: true,
      isProd: false,
    },
  });
  const sheetsServer = await startServer({
    app: sheetsApp,
    host: '127.0.0.1',
    port: 0,
  });
  const sheetsPort = sheetsServer.address().port;
  try {
    const health = await request(sheetsPort, 'GET', '/api/health');
    assert.strictEqual(health.json.mode.storeAdapter, 'sheets');
    assert.strictEqual(health.json.dependencies.data.kind, 'sheets');
    assert.strictEqual(health.json.mode.stagingWrites, false);
    ok('sheets health reports adapter + stagingWrites false');

    const loginR = await login(sheetsPort, 'ts3admin', 'ts3-98860');
    const tasks = await request(sheetsPort, 'GET', '/api/tasks', {
      token: loginR.token,
    });
    assert.strictEqual(tasks.status, 200);
    const names = (tasks.json.tasks || []).map((t) => t.name);
    assert.ok(
      names.includes('Sheets Fixture Read Task'),
      'fixture task missing: ' + names.join(',')
    );
    ok('sheets fixture: list tasks includes fixture row');

    const create = await request(sheetsPort, 'POST', '/api/tasks', {
      token: loginR.token,
      body: { projectCode: 'PRJ001', name: 'Should Refuse Write ' + Date.now() },
    });
    assert.strictEqual(create.status, 403, JSON.stringify(create.json));
    assert.ok(/STAGING_WRITES/i.test(JSON.stringify(create.json)));
    ok('sheets STAGING_WRITES=false refuses create');
  } catch (e) {
    fail('sheets http', e);
  } finally {
    await new Promise((r) => sheetsServer.close(r));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
