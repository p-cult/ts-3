'use strict';

/**
 * Slice 06 — controlled Staging writes (gates + health banner).
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const { startServer } = require('./server');
const { createApp } = require('./app');
const { config: baseConfig } = require('./config');
const { createSheetsData } = require('./data/sheets');

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

async function main() {
  console.log('slice 06 tests\n');
  const fixture = path.join(__dirname, 'data', 'fixtures', 'sheets-depot.json');

  try {
    const s = createSheetsData({
      stagingWrites: true,
      appMode: 'staging',
      writerOfRecord: 'ts2',
      fixturePath: fixture,
    });
    assert.throws(
      () =>
        s.commitBirth({
          taskId: 'PRJ0019001Z02',
          name: 'no',
          status: 'Active',
          userSheet: 'u',
          assigneeUsername: 'ts3admin',
        }),
      (e) => /WRITER_OF_RECORD/i.test(e.message)
    );
    ok('refuses write when WRITER_OF_RECORD=ts2');
  } catch (e) {
    fail('writer gate', e);
  }

  try {
    const s = createSheetsData({
      stagingWrites: true,
      appMode: 'production',
      writerOfRecord: 'ts3',
      fixturePath: fixture,
    });
    assert.throws(
      () =>
        s.commitBirth({
          taskId: 'PRJ0019001Z03',
          name: 'no',
          status: 'Active',
          userSheet: 'u',
          assigneeUsername: 'ts3admin',
        }),
      (e) => /APP_MODE/i.test(e.message)
    );
    ok('refuses write when APP_MODE!=staging');
  } catch (e) {
    fail('appMode gate', e);
  }

  try {
    const s = createSheetsData({
      stagingWrites: true,
      appMode: 'staging',
      writerOfRecord: 'ts3',
      fixturePath: fixture,
    });
    const row = s.commitBirth({
      taskId: 'PRJ0029001B01',
      projectCode: 'PRJ002',
      projectName: 'Other Project',
      name: 'Allowed Staging Write',
      status: 'Active',
      assigneeUsername: 'ts3admin',
      userSheet: 'user-ts3admin',
      kind: 'main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.strictEqual(row.name, 'Allowed Staging Write');
    ok('allows write when staging + STAGING_WRITES + WRITER_OF_RECORD=ts3');
  } catch (e) {
    fail('allowed write', e);
  }

  const app = createApp({
    config: {
      ...baseConfig,
      storeAdapter: 'sheets',
      stagingWrites: true,
      writerOfRecord: 'ts3',
      appMode: 'staging',
      useLiveBridge: false,
      isDev: true,
      isProd: false,
    },
  });
  const server = await startServer({ app, host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  try {
    const h = await request(port, 'GET', '/api/health');
    assert.strictEqual(h.json.slice, '11');
    assert.strictEqual(h.json.mode.stagingWrites, true);
    assert.strictEqual(h.json.mode.writerOfRecord, 'ts3');
    assert.ok(h.json.banner && h.json.banner.stagingWrites);
    assert.ok(/STAGING WRITES ON/i.test(h.json.banner.message));
    ok('health banner when staging writes on');

    const login = await request(port, 'POST', '/api/login', {
      body: { username: 'ts3admin', password: 'ts3-98860' },
    });
    assert.strictEqual(login.status, 200);
    const created = await request(port, 'POST', '/api/tasks', {
      token: login.json.token,
      body: { projectCode: 'PRJ001', name: 'Slice06 HTTP ' + Date.now() },
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    const ref = created.json.task.ref;
    const patched = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(ref), {
      token: login.json.token,
      body: { status: 'Pause' },
    });
    assert.strictEqual(patched.status, 200);
    assert.strictEqual(patched.json.task.status, 'Pause');
    ok('HTTP create + patch with gated staging writes');
  } catch (e) {
    fail('http staging writes', e);
  } finally {
    await new Promise((r) => server.close(r));
  }

  // Default still refuses
  const def = await startServer({ host: '127.0.0.1', port: 0 });
  try {
    const h = await request(def.address().port, 'GET', '/api/health');
    assert.strictEqual(h.json.mode.stagingWrites, false);
    assert.ok(h.json.banner && /writes off/i.test(h.json.banner.message));
    ok('default health: staging writes off');
  } catch (e) {
    fail('default health', e);
  } finally {
    await new Promise((r) => def.close(r));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
