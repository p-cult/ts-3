'use strict';

/**
 * Slice 14 — Controlled live write (bridge unlock + awaited birth).
 * Defaults stay writes-off; this slice proves the supervised path.
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const { startServer } = require('./server');
const { createApp } = require('./app');
const { config: baseConfig } = require('./config');
const { createSheetsData } = require('./data/sheets');
const { taskRowToCells } = require('./data/sheet-row');

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

function recordingBridge() {
  const calls = [];
  return {
    configured: true,
    calls,
    async ping() {
      return { ok: true, state: 'ok' };
    },
    async writeVehicle({ row }) {
      calls.push({ action: 'writeVehicle', taskId: row.taskId, userSheet: row.userSheet });
      return { ok: true, data: { userRow: 11, userSheet: row.userSheet } };
    },
    async writeDepot({ row }) {
      calls.push({ action: 'writeDepot', taskId: row.taskId });
      return { ok: true, data: { masterRow: 12 } };
    },
    async writeMapping(payload) {
      calls.push({
        action: 'writeMapping',
        taskId: payload.taskId,
        masterRow: payload.masterRow,
        userRow: payload.userRow,
      });
      return {
        ok: true,
        data: {
          mappingRow: 11,
          masterRow: payload.masterRow,
          userRow: payload.userRow,
        },
      };
    },
  };
}

async function main() {
  console.log('slice 14 tests\n');
  const fixture = path.join(__dirname, 'data', 'fixtures', 'sheets-depot.json');

  try {
    const cells = taskRowToCells({
      taskId: 'PRJ0011001A01',
      projectName: 'Sample Project',
      name: 'Poster',
      priority: 'normal',
      status: 'Active',
      assigneeUsername: 'anya',
      kind: 'main',
    });
    assert.strictEqual(cells.length, 14);
    assert.strictEqual(cells[0], 'PRJ0011001A01');
    assert.strictEqual(cells[5], 'Medium');
    assert.strictEqual(cells[10], 'Active');
    ok('taskRowToCells produces A–N');
  } catch (e) {
    fail('cells unit', e);
  }

  try {
    const bridge = recordingBridge();
    const sheets = createSheetsData({
      stagingWrites: true,
      appMode: 'staging',
      writerOfRecord: 'ts3',
      useLiveBridge: true,
      bridge,
      fixturePath: fixture,
    });
    const saved = await sheets.commitBirth({
      taskId: 'PRJ0019001A88',
      projectCode: 'PRJ001',
      projectName: 'Sample Project',
      name: 'Supervised Birth',
      status: 'Active',
      priority: 'normal',
      assigneeUsername: 'ts3admin',
      userSheet: 'user-ts3admin',
      kind: 'main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.strictEqual(saved.taskId, 'PRJ0019001A88');
    assert.deepStrictEqual(
      bridge.calls.map((c) => c.action),
      ['writeVehicle', 'writeDepot', 'writeMapping']
    );
    assert.strictEqual(bridge.calls[2].masterRow, 12);
    assert.strictEqual(bridge.calls[2].userRow, 11);
    assert.ok(sheets.findByTaskId('PRJ0019001A88'));
    ok('awaited live birth: vehicle → depot → mapping with row coords');
  } catch (e) {
    fail('live birth order', e);
  }

  try {
    const bridge = {
      configured: true,
      async writeVehicle() {
        throw new Error('bridge refused vehicle');
      },
      async writeDepot() {
        throw new Error('should not reach depot');
      },
      async writeMapping() {
        throw new Error('should not reach mapping');
      },
    };
    const sheets = createSheetsData({
      stagingWrites: true,
      appMode: 'staging',
      writerOfRecord: 'ts3',
      useLiveBridge: true,
      bridge,
      fixturePath: fixture,
    });
    let threw = false;
    try {
      await sheets.commitBirth({
        taskId: 'PRJ0019001A89',
        name: 'Rollback Me',
        status: 'Active',
        assigneeUsername: 'ts3admin',
        userSheet: 'user-ts3admin',
        kind: 'main',
      });
    } catch (e) {
      threw = /bridge refused vehicle/i.test(String(e && e.message));
    }
    assert.ok(threw);
    assert.strictEqual(sheets.findByTaskId('PRJ0019001A89'), null);
    ok('live birth failure rolls back mirror');
  } catch (e) {
    fail('rollback', e);
  }

  try {
    const bridge = recordingBridge();
    const sheets = createSheetsData({
      stagingWrites: false,
      appMode: 'staging',
      writerOfRecord: 'ts3',
      useLiveBridge: true,
      bridge,
      fixturePath: fixture,
    });
    assert.throws(
      () =>
        sheets.commitBirth({
          taskId: 'PRJ0019001A90',
          name: 'nope',
          status: 'Active',
          userSheet: 'u',
          assigneeUsername: 'ts3admin',
        }),
      (e) => /STAGING_WRITES/i.test(e.message)
    );
    assert.strictEqual(bridge.calls.length, 0);
    ok('default STAGING_WRITES=false still refuses before bridge');
  } catch (e) {
    fail('gate still on', e);
  }

  const fetchImpl = async (_url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    let json = { ok: true };
    if (body.action === 'ping') json = { ok: true, action: 'ping', master: true };
    else if (body.action === 'getDepot') json = { ok: true, rows: [] };
    else if (body.action === 'getUsers') {
      json = {
        ok: true,
        users: [
          {
            username: 'ts3admin',
            password: 'ts3-98860',
            displayName: 'TS3 Admin',
            profile: 4,
            employeeId: '9001',
            userSheet: 'user-ts3admin',
          },
        ],
      };
    } else if (body.action === 'getProjects') {
      json = { ok: true, projects: [{ code: 'PRJ001', name: 'Sample Project' }] };
    } else if (body.action === 'writeVehicle') {
      json = { ok: true, data: { userRow: 20, userSheet: body.row.userSheet } };
    } else if (body.action === 'writeDepot') {
      json = { ok: true, data: { masterRow: 21 } };
    } else if (body.action === 'writeMapping') {
      json = {
        ok: true,
        data: {
          mappingRow: 15,
          masterRow: body.masterRow,
          userRow: body.userRow,
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(json);
      },
    };
  };

  const app = createApp({
    config: {
      ...baseConfig,
      storeAdapter: 'sheets',
      stagingWrites: true,
      writerOfRecord: 'ts3',
      useLiveBridge: true,
      bridgeUrl: 'https://example.test/bridge',
      bridgeSecret: 'secret',
      fetchImpl,
      appMode: 'staging',
      isDev: true,
      isProd: false,
      sheetsFixturePath: fixture,
    },
  });
  const server = await startServer({ app, host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  try {
    const health = await request(port, 'GET', '/api/health');
    assert.strictEqual(health.json.slice, '15');
    assert.strictEqual(health.json.mode.stagingWrites, true);
    assert.strictEqual(health.json.mode.writerOfRecord, 'ts3');
    ok('health slice 15 reports supervised write mode');

    const admin = await login(port, 'ts3admin', 'ts3-98860');
    const create = await request(port, 'POST', '/api/tasks', {
      token: admin.token,
      body: {
        projectCode: 'PRJ001',
        name: 'HTTP Supervised Birth ' + Date.now(),
      },
    });
    assert.strictEqual(create.status, 201, JSON.stringify(create.json));
    assert.ok(create.json.task && create.json.task.ref);
    ok('HTTP create succeeds with live bridge + gates on');
  } catch (e) {
    fail('http supervised', e);
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
