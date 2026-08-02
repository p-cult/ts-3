'use strict';

/**
 * Slice 13 — Live Sheets read (bridge hydrate; STAGING_WRITES still false).
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const { startServer } = require('./server');
const { createApp } = require('./app');
const { config: baseConfig } = require('./config');
const { createSheetsData } = require('./data/sheets');
const {
  normalizeSheetTaskRow,
  normalizeSheetProjectRow,
  normalizeSheetUserRow,
  normalizeStatus,
  normalizePriority,
} = require('./data/sheet-row');

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

function mockBridge(payloads) {
  return {
    configured: true,
    async ping() {
      return { ok: true, state: 'ok', message: 'mock' };
    },
    async getDepot() {
      return { ok: true, rows: payloads.depot || [] };
    },
    async getUsers() {
      return { ok: true, users: payloads.users || [] };
    },
    async getProjects() {
      return { ok: true, projects: payloads.projects || [] };
    },
  };
}

function fetchImplFor(payloads) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    let json = { ok: false, error: 'unknown' };
    if (body.action === 'ping') json = { ok: true, action: 'ping', master: true };
    else if (body.action === 'getDepot') json = { ok: true, rows: payloads.depot || [] };
    else if (body.action === 'getUsers') json = { ok: true, users: payloads.users || [] };
    else if (body.action === 'getProjects') {
      json = { ok: true, projects: payloads.projects || [] };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(json);
      },
    };
  };
}

async function main() {
  console.log('slice 13 tests\n');

  try {
    assert.strictEqual(normalizeStatus('Assigned'), 'Active');
    assert.strictEqual(normalizeStatus('Completed'), 'Done');
    assert.strictEqual(normalizeStatus('Paused'), 'Pause');
    assert.strictEqual(normalizeStatus('Approved'), 'Done');
    assert.strictEqual(normalizeStatus('Rejected'), 'Blocked');
    assert.strictEqual(normalizeStatus('Finished'), 'Done');
    assert.strictEqual(normalizeStatus('In Progress'), 'Active');
    assert.strictEqual(normalizePriority('Medium'), 'normal');
    assert.strictEqual(normalizePriority('High'), 'high');

    const { serializeStatus, serializeStatusForSheet, toSheetWriteRow, TASK_APPROVED_MARK } = require('./data/sheet-row');
    // In-memory / API uses ts-3 terms
    assert.strictEqual(serializeStatus('Active', { birth: true }), 'Active');
    assert.strictEqual(serializeStatus('Active'), 'Active');
    assert.strictEqual(serializeStatus('Resume'), 'Resume');
    assert.strictEqual(serializeStatus('Pause'), 'Pause');
    assert.strictEqual(serializeStatus('Blocked'), 'Blocked');
    assert.strictEqual(serializeStatus('Done'), 'Done');
    assert.strictEqual(serializeStatus('Draft'), 'Draft');
    assert.strictEqual(serializeStatus('Draft', { birth: true }), 'Active');
    assert.strictEqual(serializeStatus('Assigned'), 'Active'); // legacy → ts-3
    // Live Master column K vocab
    assert.strictEqual(serializeStatusForSheet('Active', { birth: true }), 'Assigned');
    assert.strictEqual(serializeStatusForSheet('Active'), 'Assigned');
    assert.strictEqual(serializeStatusForSheet('Pause'), 'Pause');
    assert.strictEqual(serializeStatusForSheet('Done'), 'Completed');
    assert.strictEqual(
      serializeStatusForSheet('Done', { notes: TASK_APPROVED_MARK }),
      'Approved'
    );
    assert.strictEqual(serializeStatusForSheet('Blocked'), 'Rejected');
    const { statusMatchesFilter } = require('./domain/status');
    assert.ok(statusMatchesFilter('Resume', 'Active'));
    assert.ok(statusMatchesFilter('Active', 'Active'));
    assert.ok(!statusMatchesFilter('Pause', 'Active'));
    assert.strictEqual(toSheetWriteRow({ status: 'Done', notes: TASK_APPROVED_MARK }).status, 'Done');
    assert.strictEqual(toSheetWriteRow({ status: 'Pause' }).status, 'Pause');

    const approvedRow = normalizeSheetTaskRow(
      {
        taskId: 'PRJ0011001A01',
        project: 'Sample',
        name: 'Approved poster',
        status: 'Approved',
        notes: 'ok',
      },
      { userSheet: 'user-anya', assigneeUsername: 'anya' }
    );
    assert.strictEqual(approvedRow.status, 'Done');
    assert.ok(String(approvedRow.notes).indexOf(TASK_APPROVED_MARK) >= 0);
    ok('ts-3 API status + Master sheet K mapping');

    const fromArr = normalizeSheetTaskRow(
      [
        'PRJ0011001A01',
        'Sample Project',
        'Live Poster',
        'desc',
        'note',
        'Medium',
        'https://ex.com',
        '',
        '15 Aug',
        '',
        'Assigned',
        'Anya',
      ],
      { userSheet: 'user-anya', assigneeUsername: 'anya' }
    );
    assert.ok(fromArr);
    assert.strictEqual(fromArr.status, 'Active');
    assert.strictEqual(fromArr.priority, 'normal');
    assert.strictEqual(fromArr.userSheet, 'user-anya');
    assert.strictEqual(fromArr.name, 'Live Poster');

    const proj = normalizeSheetProjectRow(['Grant', 'grnt01']);
    assert.deepStrictEqual(proj, { code: 'GRNT01', name: 'Grant' });
    const projSchema = normalizeSheetProjectRow(['PRJ001', 'Sample Project']);
    assert.deepStrictEqual(projSchema, {
      code: 'PRJ001',
      name: 'Sample Project',
    });
    const rich = normalizeSheetProjectRow([
      'Cult Edits+',
      'cedt',
      '0',
      'cedt00',
      'Cult Edits+',
      'Cult Video & Design',
      'Cult Video & Des',
      'yes',
    ]);
    assert.strictEqual(rich.code, 'CEDT00');
    assert.strictEqual(rich.name, 'Cult Edits+');
    assert.strictEqual(rich.pseudoName, 'Cult Video & Design');
    assert.strictEqual(
      normalizeSheetProjectRow([
        'Cult Edits+',
        'cedt',
        '0',
        'cedt00',
        'Cult Edits+',
        '',
        '',
        'no',
      ]),
      null
    );

    const user = normalizeSheetUserRow({
      userSheet: 'user-anya',
      employeeId: '1001',
      username: 'anya',
      password: 'anya',
      profile: 2,
      displayName: 'Anya',
    });
    assert.strictEqual(user.username, 'anya');
    assert.strictEqual(user.profile, 2);
    ok('sheet-row normalizers map live A–L + admin/users');
  } catch (e) {
    fail('sheet-row unit', e);
  }

  try {
    const bridge = mockBridge({
      depot: [
        {
          taskId: 'PRJ0011001A77',
          project: 'Sample Project',
          name: 'Bridge Hydrated Task',
          status: 'Active',
          priority: 'High',
          assignedTo: 'Anya',
          userSheet: 'user-anya',
        },
      ],
      users: [
        {
          username: 'anya',
          password: 'anya',
          displayName: 'Anya',
          profile: 2,
          employeeId: '1001',
          userSheet: 'user-anya',
        },
        {
          username: 'ts3admin',
          password: 'ts3-98860',
          displayName: 'TS3 Admin',
          profile: 4,
          employeeId: '9001',
          userSheet: 'user-ts3admin',
        },
      ],
      projects: [{ code: 'PRJ001', name: 'Sample Project' }],
    });
    const sheets = createSheetsData({
      stagingWrites: false,
      writerOfRecord: 'ts3',
      appMode: 'staging',
      useLiveBridge: true,
      bridge,
      fixturePath: path.join(__dirname, 'data', 'fixtures', 'sheets-depot.json'),
    });
    assert.ok(sheets.listDepot().length > 0, 'fixture loaded before refresh');
    const r = await sheets.refreshFromBridge();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.keptFixture, false);
    const depot = sheets.listDepot();
    assert.strictEqual(depot.length, 1);
    assert.strictEqual(depot[0].name, 'Bridge Hydrated Task');
    assert.strictEqual(depot[0].status, 'Active');
    assert.strictEqual(depot[0].assigneeUsername, 'anya');
    assert.ok(sheets.findUser('anya'));
    assert.ok(sheets.findProject('PRJ001'));
    assert.strictEqual(sheets.projectsSource, 'bridge');
    assert.throws(
      () =>
        sheets.commitBirth({
          taskId: 'PRJ0019001Z99',
          name: 'nope',
          userSheet: 'u',
          status: 'Active',
          assigneeUsername: 'ts3admin',
        }),
      (err) => err && /STAGING_WRITES/i.test(err.message)
    );
    ok('refreshFromBridge replaces fixture; writes still refused');
  } catch (e) {
    fail('refresh unit', e);
  }

  try {
    const bridge = mockBridge({
      depot: [],
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
      projects: [{ code: 'PRJ001', name: 'Sample Project' }],
    });
    const sheets = createSheetsData({
      stagingWrites: false,
      useLiveBridge: true,
      bridge,
      fixturePath: path.join(__dirname, 'data', 'fixtures', 'sheets-depot.json'),
    });
    await sheets.refreshFromBridge();
    assert.strictEqual(sheets.listDepot().length, 0, 'empty live depot clears fixture');
    ok('empty live depot is honest (no silent fixture fallback)');
  } catch (e) {
    fail('empty depot', e);
  }

  const livePayload = {
    depot: [
      {
        taskId: 'PRJ0021002A01',
        project: 'Other Project',
        name: 'Boot Hydrate Row',
        status: 'Ongoing',
        userSheet: 'user-ravi',
        assignedTo: 'Ravi',
      },
    ],
    users: [
      {
        username: 'ts3admin',
        password: 'ts3-98860',
        displayName: 'TS3 Admin',
        profile: 4,
        employeeId: '9001',
        userSheet: 'user-ts3admin',
      },
      {
        username: 'ravi',
        password: 'ravi',
        displayName: 'Ravi',
        profile: 2,
        employeeId: '1002',
        userSheet: 'user-ravi',
      },
    ],
    projects: [{ code: 'PRJ002', name: 'Other Project' }],
  };

  const liveApp = createApp({
    config: {
      ...baseConfig,
      storeAdapter: 'sheets',
      stagingWrites: false,
      writerOfRecord: 'ts3',
      useLiveBridge: true,
      bridgeUrl: 'https://example.test/bridge',
      bridgeSecret: 'secret',
      bridgeProtocol: 'semantic',
      fetchImpl: fetchImplFor(livePayload),
      appMode: 'staging',
      isDev: true,
      isProd: false,
      sheetsFixturePath: path.join(__dirname, 'data', 'fixtures', 'sheets-depot.json'),
    },
  });

  const server = await startServer({
    app: liveApp,
    host: '127.0.0.1',
    port: 0,
  });
  const port = server.address().port;
  try {
    const health = await request(port, 'GET', '/api/health');
    assert.strictEqual(health.json.slice, '15');
    assert.strictEqual(health.json.mode.storeAdapter, 'sheets');
    assert.strictEqual(health.json.mode.stagingWrites, false);
    assert.strictEqual(health.json.mode.liveBridge, true);
    ok('health slice 15 + liveBridge + stagingWrites false');

    const admin = await login(port, 'ts3admin', 'ts3-98860');
    const tasks = await request(port, 'GET', '/api/tasks', { token: admin.token });
    assert.strictEqual(tasks.status, 200);
    const names = (tasks.json.tasks || []).map((t) => t.name);
    assert.ok(names.includes('Boot Hydrate Row'), names.join(','));
    assert.ok(
      !names.includes('Sheets Fixture Read Task'),
      'fixture task must not remain after live hydrate'
    );

    const create = await request(port, 'POST', '/api/tasks', {
      token: admin.token,
      body: { projectCode: 'PRJ002', name: 'Refuse Live Write ' + Date.now() },
    });
    assert.strictEqual(create.status, 403);
    assert.ok(/STAGING_WRITES/i.test(JSON.stringify(create.json)));
    ok('HTTP list shows bridge rows; create still 403');
  } catch (e) {
    fail('http live read', e);
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
