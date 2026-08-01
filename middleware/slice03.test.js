'use strict';

/**
 * Slice 03 tests — visible/invisible dual writers.
 */

const http = require('http');
const assert = require('assert');
const { startServer } = require('./server');
const {
  classifyField,
  pickVisibleFields,
  refuseInvisibleFields,
  invisibleKeysIn,
  joinVisibleAndHistory,
  INVISIBLE_FIELDS,
} = require('./domain/field-class');
const { createSheetWriter } = require('./data/sheet-writer');
const { createHistoryWriter } = require('./data/history-writer');

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
  console.log('slice 03 tests\n');

  // —— Pure domain ——
  try {
    assert.strictEqual(classifyField('name'), 'visible');
    assert.strictEqual(classifyField('stages'), 'invisible');
    assert.strictEqual(classifyField('reviews'), 'invisible');
    assert.strictEqual(classifyField('reviewHistory'), 'invisible');
    assert.strictEqual(classifyField('ref'), 'derived');
    assert.strictEqual(classifyField('hasLink'), 'derived');
    ok('field-class map visible/invisible/derived');
  } catch (e) {
    fail('field-class map', e);
  }

  try {
    const picked = pickVisibleFields({
      name: 'A',
      stages: { tokens: ['#x'], currentIndex: 0 },
      reviews: [{ notes: 'nope' }],
      ref: 'secret-ref',
      status: 'Active',
    });
    assert.strictEqual(picked.name, 'A');
    assert.strictEqual(picked.status, 'Active');
    assert.strictEqual(picked.stages, undefined);
    assert.strictEqual(picked.reviews, undefined);
    assert.strictEqual(picked.ref, undefined);
    ok('pickVisibleFields strips invisible + derived');
  } catch (e) {
    fail('pickVisibleFields', e);
  }

  try {
    assert.throws(
      () => refuseInvisibleFields({ name: 'x', stages: { tokens: [] } }),
      (err) => err && err.code === 'INVISIBLE_FIELD'
    );
    assert.deepStrictEqual(invisibleKeysIn({ reviews: [], name: 'n' }), [
      'reviews',
    ]);
    ok('refuseInvisibleFields throws on stages/reviews');
  } catch (e) {
    fail('refuseInvisibleFields', e);
  }

  try {
    const joined = joinVisibleAndHistory(
      { taskId: 'ABCDEF1234A01', name: 'T', status: 'Active' },
      {
        stages: { tokens: ['#design', '#ship'], currentIndex: 1 },
        reviews: [{ action: 'feedback', notes: 'ok' }],
      }
    );
    assert.strictEqual(joined.stagesSummary, '1/2');
    assert.strictEqual(joined.reviewCount, 1);
    assert.strictEqual(joined.lastReview.notes, 'ok');
    assert.ok(joined.stages);
    ok('joinVisibleAndHistory for reports/logs');
  } catch (e) {
    fail('joinVisibleAndHistory', e);
  }

  // —— Writer unit (mock store) ——
  try {
    let born = null;
    let patched = null;
    const sheets = createSheetWriter({
      commitBirth(row) {
        born = row;
        return row;
      },
      updateByTaskId(id, patch) {
        patched = { id, patch };
        return patch;
      },
    });
    sheets.commitBirth({
      taskId: 'ABCDEF1234A01',
      name: 'Born',
      status: 'Active',
    });
    assert.strictEqual(born.name, 'Born');
    assert.throws(() =>
      sheets.commitBirth({
        taskId: 'ABCDEF1234A02',
        name: 'Bad',
        stages: { tokens: ['#a'], currentIndex: 0 },
      })
    );
    assert.throws(() =>
      sheets.updateByTaskId('ABCDEF1234A01', {
        status: 'Pause',
        reviewHistory: [{ x: 1 }],
      })
    );
    sheets.updateByTaskId('ABCDEF1234A01', { status: 'Pause' });
    assert.strictEqual(patched.patch.status, 'Pause');
    ok('sheetWriter refuses invisible; writes visible');
  } catch (e) {
    fail('sheetWriter unit', e);
  }

  try {
    const mem = {
      stages: null,
      reviews: [],
      getStages() {
        return this.stages;
      },
      setStages(_id, s) {
        this.stages = s;
        return s;
      },
      getReviews() {
        return this.reviews.slice();
      },
      appendReview(_id, e) {
        this.reviews.push(e);
        return this.getReviews();
      },
    };
    const hist = createHistoryWriter(mem);
    hist.setStages('T1', { tokens: ['#a'], currentIndex: 0 });
    hist.appendReview('T1', { action: 'submit', notes: 'n' });
    const snap = hist.snapshot('T1');
    assert.deepStrictEqual(snap.stages.tokens, ['#a']);
    assert.strictEqual(snap.reviews.length, 1);
    ok('historyWriter side-store only');
  } catch (e) {
    fail('historyWriter unit', e);
  }

  // —— HTTP + live data partitions ——
  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  const app = server.app;
  if (app.data._side && typeof app.data._side._reset === 'function') {
    app.data._side._reset();
  }

  try {
    {
      const r = await request(port, 'GET', '/api/health');
      assert.strictEqual(r.json.slice, '03');
      assert.strictEqual(r.json.mode.appMode, 'staging');
    }
    ok('health slice 03 staging');

    const admin = await login(port, 'ts3admin', 'ts3-98860');
    const token = admin.token;

    const created = await request(port, 'POST', '/api/tasks', {
      token,
      body: {
        projectCode: 'PRJ001',
        name: 'Slice03 Dual Writer ' + Date.now(),
        description: 'visible birth',
      },
    });
    assert.ok(
      created.status === 201 || created.status === 200,
      JSON.stringify(created.json)
    );
    const ref = created.json.task.ref;
    assert.ok(ref);
    assert.strictEqual(created.json.task.status, 'Active');
    assert.ok(!created.json.task.taskId);
    ok('visible birth returns public DTO (no taskId)');

    const row = app.data.findByRef(ref);
    assert.ok(row && row.taskId);
    for (const key of INVISIBLE_FIELDS) {
      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(row, key),
        false,
        'depot must not have ' + key
      );
    }
    const parts = app.data.partitionsFor(row.taskId);
    assert.ok(parts.depot);
    assert.ok(parts.vehicle);
    assert.strictEqual(parts.depot.stages, undefined);
    assert.strictEqual(parts.depot.reviews, undefined);
    assert.strictEqual(parts.vehicle.stages, undefined);
    ok('depot/vehicle rows have no stages/reviews keys');

    // Stages go to history only
    const st = await request(port, 'PATCH', '/api/tasks/' + encodeURIComponent(ref) + '/stages', {
      token,
      body: { tokens: ['#design', '#build'], currentIndex: 1 },
    });
    assert.ok(st.status === 200 || st.status === 204 || st.json, JSON.stringify(st.json));
    const afterStages = app.data.findByTaskId(row.taskId);
    assert.strictEqual(afterStages.stages, undefined);
    const sideStages = app.data.getStages(row.taskId);
    assert.ok(sideStages);
    assert.deepStrictEqual(sideStages.tokens, ['#design', '#build']);
    assert.strictEqual(sideStages.currentIndex, 1);
    ok('stages live in side-store only, not depot');

    // Direct refuse on commitBirth with invisible
    let refused = false;
    try {
      app.data.commitBirth({
        ...row,
        taskId: 'ZZZZZZ9999Z99',
        name: 'Should Refuse',
        stages: { tokens: ['#no'], currentIndex: 0 },
      });
    } catch (e) {
      refused = true;
      assert.ok(
        e.message && e.message.indexOf('invisible') >= 0,
        e.message
      );
    }
    assert.ok(refused);
    ok('commitBirth refuses stages payload');

    // Patch refuse
    refused = false;
    try {
      app.data.updateByTaskId(row.taskId, {
        status: 'Pause',
        reviews: [{ notes: 'leak' }],
      });
    } catch (e) {
      refused = true;
    }
    assert.ok(refused);
    const still = app.data.findByTaskId(row.taskId);
    assert.notStrictEqual(still.status, 'Pause'); // refused before write
    ok('updateByTaskId refuses reviews payload');

    // Review append stays off depot
    app.data.appendReview(row.taskId, {
      action: 'feedback',
      notes: 'history only',
      at: new Date().toISOString(),
    });
    const depotAgain = app.data.findByTaskId(row.taskId);
    assert.strictEqual(depotAgain.reviews, undefined);
    assert.strictEqual(depotAgain.reviewHistory, undefined);
    assert.strictEqual(app.data.getReviews(row.taskId).length, 1);
    ok('review history side-store only');

    const joined = app.data.joinHistory(row.taskId);
    assert.strictEqual(joined.stagesSummary, '1/2');
    assert.strictEqual(joined.reviewCount, 1);
    ok('data.joinHistory joins visible + side history');

    const logs = await request(port, 'GET', '/api/logs', { token });
    assert.strictEqual(logs.status, 200);
    const hit = (logs.json.logs || []).find((l) => l.ref === ref);
    assert.ok(hit);
    assert.strictEqual(hit.stagesSummary, '1/2');
    assert.ok(hit.reviewCount >= 1);
    ok('logs join visible + history');
  } catch (e) {
    fail('http dual-writer flow', e);
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
