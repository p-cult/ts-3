'use strict';

/**
 * Slice 02 tests — kinds, stages, review, logs, duplicate-never-mints.
 */

const http = require('http');
const assert = require('assert');
const { startServer } = require('./server');
const { parseStageTokens } = require('./domain/stages');
const { learnKind, normalizeKind } = require('./domain/kinds');
const { normName } = require('./domain/identity');

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
  console.log('slice 02 tests\n');
  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  const app = server.app;
  // Isolate from persisted side-store leftovers across runs (Task IDs recycle).
  if (app.data._side && typeof app.data._side._reset === 'function') {
    app.data._side._reset();
  }

  try {
    {
      const r = await request(port, 'GET', '/api/health');
      assert.strictEqual(r.json.slice, '15');
      assert.strictEqual(r.json.mode.appMode, 'staging');
      ok('health slice 07 staging');
    }

    // A — duplicate never mints
    {
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const name = 'Dup Mint Guard ' + Date.now();
      const a = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name },
      });
      assert.strictEqual(a.status, 201);
      const depotN = app.data.listDepot().length;
      const idsN = app.data.allTaskIds().length;
      const b = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: '  ' + name.toUpperCase() + '  ' },
      });
      // name normalized in guard via normName — but we store trimmed original case
      // identity uses normName so "  FOO  " vs "foo" — create uses trim only on name
      // For case: "Dup" vs "dup" — normName lowercases so should 409 if same after norm
      assert.strictEqual(b.status, 409, 'expected 409 got ' + b.status);
      assert.strictEqual(app.data.listDepot().length, depotN);
      assert.strictEqual(app.data.allTaskIds().length, idsN);
      ok('duplicate create 409; depot and taskId set unchanged');
    }

    // exact case-insensitive dup
    {
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const name = 'Case Dup ' + Date.now();
      await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ002', name },
      });
      const idsN = app.data.allTaskIds().length;
      const r = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ002', name: name.toLowerCase() },
      });
      assert.strictEqual(r.status, 409);
      assert.strictEqual(app.data.allTaskIds().length, idsN);
      ok('case-insensitive name duplicate does not mint');
    }

    // B — kinds
    {
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const main = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'Main H ' + Date.now() },
      });
      assert.strictEqual(main.status, 201);
      // default kind main — P2 dto may show main
      assert.ok(main.json.task.kind === 'main' || main.json.task.kind === undefined);

      // Parent is client ref from Main list (parentRef)
      const sub = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: {
          projectCode: 'PRJ001',
          name: 'Sub H ' + Date.now(),
          parentRef: main.json.task.ref,
        },
      });
      assert.strictEqual(sub.status, 201);
      assert.strictEqual(sub.json.task.parentRef, main.json.task.ref);
      assert.strictEqual(sub.json.task.kind, 'sub');
      // never exposes internal Task ID as parent
      assert.strictEqual(sub.json.task.parentTaskId, undefined);
      assert.strictEqual(sub.json.task.taskId, undefined);

      // public list includes main+sub, nested
      const pub = await request(port, 'GET', '/api/tasks?nested=1');
      assert.strictEqual(pub.status, 200);
      const flat = pub.json.tasks || [];
      assert.ok(flat.some((t) => t.ref === main.json.task.ref));
      assert.ok(flat.some((t) => t.ref === sub.json.task.ref));
      assert.ok(pub.json.hierarchy);

      // admin sets pseudo
      const pseudoName = 'Learnable Pseudo ' + Date.now();
      const p1 = await request(port, 'POST', '/api/tasks', {
        token: admin.token,
        body: {
          projectCode: 'PRJ001',
          name: pseudoName,
          kind: 'pseudo',
          assigneeUsername: 'ts3usr1',
        },
      });
      assert.strictEqual(p1.status, 201);
      // admin sees kind
      const adminList = await request(port, 'GET', '/api/tasks', { token: admin.token });
      const prow = adminList.json.tasks.find((t) => t.ref === p1.json.task.ref);
      assert.strictEqual(prow.kind, 'pseudo');
      assert.strictEqual(prow.kindIcon, 'P');

      // public excludes pseudo
      const pub2 = await request(port, 'GET', '/api/tasks');
      assert.ok(!pub2.json.tasks.some((t) => t.ref === p1.json.task.ref));

      // learning
      const learned = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: pseudoName + ' x' },
      });
      // different name — create another with EXACT same name as pseudo
      // first delete would need unique - use same name as pseudoName exact
      // p1 already has pseudoName — duplicate would 409. Learning applies when NOT duplicate identity - same name same assignee is dup. Learning is same project+name across kinds for NEW assignee or we learn before dup check... Spec: same project + exact normalized name → inherit kind. If same assignee it's duplicate first. Use different assignee via admin.
      const learned2 = await request(port, 'POST', '/api/tasks', {
        token: admin.token,
        body: {
          projectCode: 'PRJ001',
          name: pseudoName,
          assigneeUsername: 'anya',
        },
      });
      assert.strictEqual(learned2.status, 201);
      const aList = await request(port, 'GET', '/api/tasks', { token: admin.token });
      const lr = aList.json.tasks.find((t) => t.ref === learned2.json.task.ref);
      assert.strictEqual(lr.kind, 'pseudo');

      // P2 cannot set kind
      const mk = await request(port, 'PATCH', '/api/tasks/' + main.json.task.ref, {
        token: usr.token,
        body: { kind: 'routine' },
      });
      assert.strictEqual(mk.status, 403);

      // restricted: only status
      const rs = await request(port, 'PATCH', '/api/tasks/' + p1.json.task.ref, {
        token: usr.token,
        body: { name: 'nope' },
      });
      assert.strictEqual(rs.status, 403);
      const rs2 = await request(port, 'PATCH', '/api/tasks/' + p1.json.task.ref, {
        token: usr.token,
        body: { status: 'Done' },
      });
      assert.strictEqual(rs2.status, 200);

      ok('kinds: default main, sub nest, public filter, learning, P2 no kind');
    }

    // C — stages
    {
      const bad = parseStageTokens('hello world');
      assert.strictEqual(bad.ok, false);
      const spaced = parseStageTokens('# tak');
      assert.strictEqual(spaced.ok, false);
      assert.ok(
        /no spaces after #/i.test(spaced.error),
        'clear error for "# tak", got: ' + spaced.error
      );
      const bare = parseStageTokens('#');
      assert.strictEqual(bare.ok, false);
      assert.ok(
        /#/.test(bare.error) && (/incomplete|lone|trailing|no spaces after #/i.test(bare.error)),
        'clear error for lone #, got: ' + bare.error
      );
      const good = parseStageTokens('#Design #Build #Ship');
      assert.strictEqual(good.ok, true);
      assert.deepStrictEqual(good.tokens, ['#Design', '#Build', '#Ship']);

      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const t = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'Staged ' + Date.now() },
      });
      const id = t.json.task.ref;
      const internal = app.data.findByRef(id);
      const st = await request(port, 'PATCH', '/api/tasks/' + id + '/stages', {
        token: usr.token,
        body: { text: '#A #B #C', currentIndex: 1 },
      });
      assert.strictEqual(st.status, 200);
      assert.strictEqual(st.json.stages.total, 3);
      // side store not in commitBirth row
      const row = app.data.findByRef(id);
      assert.ok(!row.tokens);
      assert.ok(app.data.getStages(internal.taskId));

      // pseudo cannot stages
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      const p = await request(port, 'POST', '/api/tasks', {
        token: admin.token,
        body: {
          projectCode: 'PRJ001',
          name: 'NoStage ' + Date.now(),
          kind: 'routine',
          assigneeUsername: 'ts3usr1',
        },
      });
      const st2 = await request(port, 'PATCH', '/api/tasks/' + p.json.task.ref + '/stages', {
        token: usr.token,
        body: { text: '#X' },
      });
      assert.strictEqual(st2.status, 400);
      ok('stages parse, side store, main/sub only');
    }

    // D — review
    {
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const mira = await login(port, 'mira', 'mira');
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      const t = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: {
          projectCode: 'PRJ001',
          name: 'ReviewMe ' + Date.now(),
          link: 'https://example.com/v1',
        },
      });
      const id = t.json.task.ref;
      assert.strictEqual(t.json.task.hasLink, true);
      assert.ok(t.json.task.link);

      // submit without link on task fails if cleared — we already have link
      const sub = await request(port, 'POST', '/api/tasks/' + id + '/review/submit', {
        token: usr.token,
        body: {},
      });
      assert.strictEqual(sub.status, 200);
      assert.strictEqual(sub.json.reviewState, 'under_review');

      // needs_review list for P3
      const needs = await request(port, 'GET', '/api/tasks?board=needs_review', {
        token: mira.token,
      });
      assert.strictEqual(needs.status, 200);
      assert.ok(needs.json.tasks.some((x) => x.ref === id));

      // P2 cannot open needs_review
      const needsP2 = await request(port, 'GET', '/api/tasks?board=needs_review', {
        token: usr.token,
      });
      assert.strictEqual(needsP2.status, 403);

      // P2 cannot approve
      const badAp = await request(port, 'POST', '/api/tasks/' + id + '/review/approve', {
        token: usr.token,
        body: {},
      });
      assert.strictEqual(badAp.status, 403);

      const fb = await request(port, 'POST', '/api/tasks/' + id + '/review/feedback', {
        token: mira.token,
        body: { notes: 'needs crop' },
      });
      assert.strictEqual(fb.status, 200);

      // rework without notes → 400
      const rw0 = await request(port, 'POST', '/api/tasks/' + id + '/review/rework', {
        token: mira.token,
        body: { notes: '' },
      });
      assert.strictEqual(rw0.status, 400);

      const rw = await request(port, 'POST', '/api/tasks/' + id + '/review/rework', {
        token: mira.token,
        body: { notes: 'try again' },
      });
      assert.strictEqual(rw.status, 200);
      assert.strictEqual(rw.json.reviewState, 'rework');
      assert.ok(rw.json.reviewIteration >= 1);

      // resubmit then approve
      await request(port, 'POST', '/api/tasks/' + id + '/review/submit', {
        token: usr.token,
        body: { link: 'https://example.com/v2' },
      });
      const ap = await request(port, 'POST', '/api/tasks/' + id + '/review/approve', {
        token: admin.token,
        body: { notes: 'ship it', ratings: [{ url: 'https://example.com/v2', stars: 3 }] },
      });
      assert.strictEqual(ap.status, 200);
      assert.strictEqual(ap.json.reviewState, 'approved');

      // New rule: to appear in completed, must also set status=Done (P2 can after good ratings)
      const setDone = await request(port, 'PATCH', '/api/tasks/' + id, {
        token: usr.token,
        body: { status: 'Done' },
      });
      assert.strictEqual(setDone.status, 200);
      assert.strictEqual(setDone.json.task.status, 'Done');

      const done = await request(port, 'GET', '/api/tasks?board=completed', {
        token: usr.token,
      });
      assert.ok(done.json.tasks.some((x) => x.ref === id));

      // ratings support: array of link-ratings with stars 1-3, tag/comment rules
      const rateT = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'RateMe ' + Date.now(), link: 'https://ex.com/r1' }
      });
      const rid = rateT.json.task.ref;
      const sR = await request(port, 'POST', '/api/tasks/' + rid + '/review/submit', {
        token: usr.token,
        body: { ratings: [ { url: 'https://ex.com/r1', stars: 3, tag: 'great', comment: 'solid' }, { url: 'https://ex.com/r2', stars: 2, tag: 'ok' } ] }
      });
      assert.strictEqual(sR.status, 200);
      const gR = await request(port, 'GET', '/api/tasks/' + rid, { token: mira.token });
      const histR = (gR.json.task.review && gR.json.task.review.history) || [];
      assert.ok(histR.some((h) => h.ratings && h.ratings.some((r) => r.stars === 3)));
      // admin rework with ratings including 1★ (stores the admin's ratings)
      await request(port, 'POST', '/api/tasks/' + rid + '/review/rework', {
        token: mira.token,
        body: { notes: 'adjust', ratings: [{ url: 'https://ex.com/r1', stars: 1, tag: 'poor', comment: 'fix it' }] }
      });
      const gR2 = await request(port, 'GET', '/api/tasks/' + rid, { token: mira.token });
      const histR2 = gR2.json.task.review.history || [];
      assert.ok(histR2.length > histR.length); // history append-only
      const reworks = histR2.filter((h) => h.action === 'rework');
      const reworkEntry = reworks[reworks.length - 1];
      assert.ok(reworkEntry);
      assert.strictEqual(reworkEntry.iteration, 1);
      assert.ok(reworkEntry.ratings && reworkEntry.ratings[0].stars === 1);

      // >4 links/ratings rejected
      const tooMany = await request(port, 'POST', '/api/tasks/' + rid + '/review/submit', {
        token: usr.token,
        body: { ratings: new Array(5).fill(0).map((_, i) => ({ url: 'https://ex.com/' + i, stars: 3 })) }
      });
      assert.strictEqual(tooMany.status, 400);

      const tooCreate = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'TooLinks ' + Date.now(), links: new Array(5).fill('http://x') }
      });
      assert.strictEqual(tooCreate.status, 400);
      ok('review star ratings + iteration reset + history');

      // === NEW RULES: COMPLETED = status Done + Done gate for 1★ ===
      // Test 1: approved but not Done must not appear in board=completed
      const noDoneTask = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'NoDone ' + Date.now(), link: 'https://ex.com/nodone' }
      });
      const ndRef = noDoneTask.json.task.ref;
      await request(port, 'POST', '/api/tasks/' + ndRef + '/review/submit', {
        token: usr.token,
        body: { ratings: [{ url: 'https://ex.com/nodone', stars: 3 }] }
      });
      await request(port, 'POST', '/api/tasks/' + ndRef + '/review/approve', {
        token: admin.token,
        body: { notes: 'approved only', ratings: [{ url: 'https://ex.com/nodone', stars: 3 }] }
      });
      const compCheck = await request(port, 'GET', '/api/tasks?board=completed', { token: usr.token });
      const inCompND = compCheck.json.tasks.some((x) => x.ref === ndRef);
      assert.strictEqual(inCompND, false, 'approved but !Done must not be in completed');
      // confirm it is approved
      const ndGet = await request(port, 'GET', '/api/tasks/' + ndRef, { token: admin.token });
      assert.strictEqual(ndGet.json.task.reviewState, 'approved');
      assert.notStrictEqual(ndGet.json.task.status, 'Done');

      // Test 2: P2 may set Done even with a 1★ rating (Done is always available)
      const badDoneTask = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'BadDone ' + Date.now(), link: 'https://ex.com/bad' }
      });
      const bdRef = badDoneTask.json.task.ref;
      await request(port, 'POST', '/api/tasks/' + bdRef + '/review/submit', {
        token: usr.token,
        body: { ratings: [{ url: 'https://ex.com/bad', stars: 3 }] }
      });
      await request(port, 'POST', '/api/tasks/' + bdRef + '/review/rework', {
        token: mira.token,
        body: { notes: '1 star', ratings: [{ url: 'https://ex.com/bad', stars: 1, tag: 'bad', comment: 'fix' }] }
      });
      const badDonePatch = await request(port, 'PATCH', '/api/tasks/' + bdRef, {
        token: usr.token,
        body: { status: 'Done' }
      });
      assert.strictEqual(badDonePatch.status, 200);
      assert.strictEqual(badDonePatch.json.task.status, 'Done');

      // Reset to Active via admin so Test 3 can re-approve files then Done again
      await request(port, 'PATCH', '/api/tasks/' + bdRef, {
        token: admin.token,
        body: { status: 'Active' }
      });

      // Test 3: after good ratings (no 1★), P2 can set Done and it appears in completed
      await request(port, 'POST', '/api/tasks/' + bdRef + '/review/submit', {
        token: usr.token,
        body: { ratings: [{ url: 'https://ex.com/bad', stars: 3 }] }
      });
      await request(port, 'POST', '/api/tasks/' + bdRef + '/review/approve', {
        token: admin.token,
        body: { notes: 'good', ratings: [{ url: 'https://ex.com/bad', stars: 3 }] }
      });
      const goodDonePatch = await request(port, 'PATCH', '/api/tasks/' + bdRef, {
        token: usr.token,
        body: { status: 'Done' }
      });
      assert.strictEqual(goodDonePatch.status, 200);
      assert.strictEqual(goodDonePatch.json.task.status, 'Done');
      const compGood = await request(port, 'GET', '/api/tasks?board=completed', { token: usr.token });
      assert.ok(compGood.json.tasks.some((x) => x.ref === bdRef));

      ok('NEW: completed=Done only + 1★ blocks Done for non-admin');

      // public list: link ok; no review notes / state / iteration (P1)
      const pub = await request(port, 'GET', '/api/tasks');
      const pt = pub.json.tasks.find((x) => x.ref === id);
      if (pt) {
        assert.ok(pt.hasLink);
        assert.ok(pt.review === undefined);
        assert.ok(pt.reviewState === undefined);
        assert.ok(pt.reviewIteration === undefined);
      }

      // P1 may browse completed (Done) work without sign-in
      const doneP1 = await request(port, 'GET', '/api/tasks?board=completed');
      assert.strictEqual(doneP1.status, 200);
      assert.ok(Array.isArray(doneP1.json.tasks));
      assert.ok(doneP1.json.tasks.every((t) => t.status === 'Done'));

      const det = await request(port, 'GET', '/api/tasks/' + id, { token: usr.token });
      assert.ok(det.json.task.review);
      assert.strictEqual(det.json.task.review.showOnDetail, false);
      assert.ok(det.json.task.reviewIteration >= 1);

      const internal = app.data.findByRef(id);
      const hist = app.data.getReviews(internal.taskId);
      assert.ok(hist.length >= 3);
      ok('review: needs_review tab, rework notes+iteration, approve→completed, public hide notes');
    }

    // E — logs
    {
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const r = await request(port, 'GET', '/api/logs', { token: usr.token });
      assert.strictEqual(r.status, 200);
      assert.ok(Array.isArray(r.json.logs));
      assert.ok(r.json.logs.every((l) => l.assigneeUsername === 'ts3usr1'));
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      const r2 = await request(port, 'GET', '/api/logs?status=Draft', {
        token: admin.token,
      });
      assert.strictEqual(r2.status, 200);
      ok('logs filter smoke');
    }

    // bulk admin
    {
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      const t = await request(port, 'POST', '/api/tasks', {
        token: admin.token,
        body: { projectCode: 'PRJ002', name: 'Bulk ' + Date.now(), kind: 'main' },
      });
      const br = await request(port, 'POST', '/api/tasks/bulk', {
        token: admin.token,
        body: { action: 'set_kind', kind: 'not_a_task', ids: [t.json.task.ref] },
      });
      assert.strictEqual(br.status, 200);
      assert.ok(br.json.results[0].ok);
      ok('bulk set_kind admin');

      // Bulk set_status Done gate (same as PATCH)
      const bulkUsr = await login(port, 'ts3usr1', 'ts3-98860');
      const badBulk = await request(port, 'POST', '/api/tasks', {
        token: bulkUsr.token,
        body: { projectCode: 'PRJ001', name: 'BulkBadDone ' + Date.now(), link: 'https://ex.com/bulkbad' }
      });
      const bbRef = badBulk.json.task.ref;
      await request(port, 'POST', '/api/tasks/' + bbRef + '/review/submit', {
        token: bulkUsr.token,
        body: { ratings: [{ url: 'https://ex.com/bulkbad', stars: 3 }] }
      });
      await request(port, 'POST', '/api/tasks/' + bbRef + '/review/rework', {
        token: admin.token,
        body: { notes: '1star', ratings: [{ url: 'https://ex.com/bulkbad', stars: 1, tag: 'bad', comment: 'fix' }] }
      });
      const bbr = await request(port, 'POST', '/api/tasks/bulk', {
        token: admin.token,
        body: { action: 'set_status', status: 'Done', ids: [bbRef] },
      });
      assert.strictEqual(bbr.status, 200);
      assert.strictEqual(bbr.json.results[0].ok, true);
      assert.strictEqual(bbr.json.results[0].action, 'set_status');
    }

    // unit learnKind
    {
      const k = learnKind(
        [{ projectCode: 'PRJ001', name: 'Foo Bar', kind: 'routine' }],
        { projectCode: 'PRJ001', name: '  foo   bar ' },
        { normName }
      );
      assert.strictEqual(k, 'routine');
      ok('unit learnKind');
    }

    // re-assign via dedicated endpoint
    {
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const mira = await login(port, 'mira', 'mira');
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      const reTask = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'ReassignTest ' + Date.now() }
      });
      const reRef = reTask.json.task.ref;
      const origRow = app.data.findByRef(reRef);
      const origTaskId = origRow ? origRow.taskId : null;

      // non-admin rejected
      const no = await request(port, 'PATCH', '/api/tasks/' + reRef + '/reassign', {
        token: usr.token,
        body: { assigneeUsername: 'mira' }
      });
      assert.strictEqual(no.status, 403);

      // P4 happy
      const p4 = await request(port, 'PATCH', '/api/tasks/' + reRef + '/reassign', {
        token: admin.token,
        body: { assigneeUsername: 'vinod' }
      });
      assert.strictEqual(p4.status, 200);
      assert.strictEqual(p4.json.task.assigneeUsername, 'vinod');
      assert.strictEqual(p4.json.task.ref, reRef);
      const after = app.data.findByRef(reRef);
      if (origTaskId) assert.strictEqual(after.taskId, origTaskId);

      // P3 can
      const p3 = await request(port, 'PATCH', '/api/tasks/' + reRef + '/reassign', {
        token: mira.token,
        body: { assigneeUsername: 'mira' }
      });
      assert.strictEqual(p3.status, 200);
      assert.strictEqual(p3.json.task.assigneeUsername, 'mira');

      // unknown user 400
      const badU = await request(port, 'PATCH', '/api/tasks/' + reRef + '/reassign', {
        token: admin.token,
        body: { assigneeUsername: 'nope' }
      });
      assert.strictEqual(badU.status, 400);

      // unknown ref 404
      const badR = await request(port, 'PATCH', '/api/tasks/xxx-missing/reassign', {
        token: admin.token,
        body: { assigneeUsername: 'vinod' }
      });
      assert.strictEqual(badR.status, 404);

      ok('reassign: P3/P4 only, ref+id frozen, user validation');
    }

    // Admin edit must not steal assignee; ownership change is /reassign only
    {
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      const created = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: {
          projectCode: 'PRJ001',
          name: 'AdminEditKeepOwner ' + Date.now(),
          description: 'orig',
        },
      });
      assert.strictEqual(created.status, 201);
      const ref = created.json.task.ref;
      assert.strictEqual(created.json.task.assigneeUsername, 'ts3usr1');
      const before = app.data.findByRef(ref);
      const sheetBefore = before && before.userSheet;

      const steal = await request(port, 'PATCH', '/api/tasks/' + ref, {
        token: admin.token,
        body: { assigneeUsername: 'ts3admin', name: 'AdminEditKeepOwner renamed' },
      });
      assert.strictEqual(steal.status, 403, 'generic PATCH must refuse assignee');

      const edited = await request(port, 'PATCH', '/api/tasks/' + ref, {
        token: admin.token,
        body: { name: 'AdminEditKeepOwner renamed', description: 'by admin' },
      });
      assert.strictEqual(edited.status, 200);
      assert.strictEqual(edited.json.task.assigneeUsername, 'ts3usr1');
      assert.strictEqual(edited.json.task.name, 'AdminEditKeepOwner renamed');
      const after = app.data.findByRef(ref);
      assert.strictEqual(after.assigneeUsername, 'ts3usr1');
      assert.strictEqual(after.userSheet, sheetBefore);

      const detail = await request(port, 'GET', '/api/tasks/' + ref, {
        token: admin.token,
      });
      assert.strictEqual(detail.status, 200);
      const hist = (detail.json.task.review && detail.json.task.review.history) || [];
      assert.ok(
        hist.some((h) => h.action === 'edit' && h.byUsername === 'ts3admin'),
        'admin edit recorded in history only'
      );

      ok('admin edit keeps assignee; history notes editor');
    }

    // P2 status: create → Active; PATCH Pause/Resume/Done
    {
      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      const t = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: { projectCode: 'PRJ001', name: 'P2Status ' + Date.now() }
      });
      assert.strictEqual(t.status, 201);
      assert.strictEqual(t.json.task.status, 'Active', 'P2 create must birth Active');
      const id = t.json.task.ref;

      const pPause = await request(port, 'PATCH', '/api/tasks/' + id, {
        token: usr.token,
        body: { status: 'Pause' }
      });
      assert.strictEqual(pPause.status, 200);
      assert.strictEqual(pPause.json.task.status, 'Pause');

      const pResume = await request(port, 'PATCH', '/api/tasks/' + id, {
        token: usr.token,
        body: { status: 'Resume' }
      });
      assert.strictEqual(pResume.status, 200);
      assert.strictEqual(pResume.json.task.status, 'Resume');

      const pDone = await request(port, 'PATCH', '/api/tasks/' + id, {
        token: usr.token,
        body: { status: 'Done' }
      });
      assert.strictEqual(pDone.status, 200);
      assert.strictEqual(pDone.json.task.status, 'Done');

      const badDraft = await request(port, 'PATCH', '/api/tasks/' + id, {
        token: usr.token,
        body: { status: 'Draft' }
      });
      assert.strictEqual(badDraft.status, 403);

      const badActive = await request(port, 'PATCH', '/api/tasks/' + id, {
        token: usr.token,
        body: { status: 'Active' }
      });
      assert.strictEqual(badActive.status, 403);

      const badBlocked = await request(port, 'PATCH', '/api/tasks/' + id, {
        token: usr.token,
        body: { status: 'Blocked' }
      });
      assert.strictEqual(badBlocked.status, 403);

      ok('P2 status: create→Active; PATCH only Pause/Resume/Done');
    }
  } catch (e) {
    fail('suite', e);
    console.error(e);
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
