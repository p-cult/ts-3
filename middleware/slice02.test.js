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

  try {
    {
      const r = await request(port, 'GET', '/api/health');
      assert.strictEqual(r.json.slice, '02');
      assert.strictEqual(r.json.mode.appMode, 'staging');
      ok('health slice 02 staging');
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
        body: { projectCode: 'PRJ001', name: 'Main H ' + Date.now(), visibility: 'public' },
      });
      assert.strictEqual(main.status, 201);
      // default kind main — P2 dto may show main
      assert.ok(main.json.task.kind === 'main' || main.json.task.kind === undefined);

      const sub = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: {
          projectCode: 'PRJ001',
          name: 'Sub H ' + Date.now(),
          parentRef: main.json.task.ref,
          visibility: 'public',
        },
      });
      assert.strictEqual(sub.status, 201);
      assert.strictEqual(sub.json.task.parentRef, main.json.task.ref);
      assert.strictEqual(sub.json.task.kind, 'sub');

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
          visibility: 'public',
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
      assert.ok(/"#"/.test(bare.error) && /no spaces after #/i.test(bare.error));
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
          visibility: 'public',
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

      // alias send-back still works
      await request(port, 'POST', '/api/tasks/' + id + '/review/submit', {
        token: usr.token,
        body: { link: 'https://example.com/v2' },
      });
      const sb = await request(port, 'POST', '/api/tasks/' + id + '/review/send-back', {
        token: mira.token,
        body: { notes: 'once more' },
      });
      assert.strictEqual(sb.status, 200);
      assert.strictEqual(sb.json.reviewState, 'rework');

      // resubmit then approve
      await request(port, 'POST', '/api/tasks/' + id + '/review/submit', {
        token: usr.token,
        body: { link: 'https://example.com/v3' },
      });
      const ap = await request(port, 'POST', '/api/tasks/' + id + '/review/approve', {
        token: admin.token,
        body: { notes: 'ship it' },
      });
      assert.strictEqual(ap.status, 200);
      assert.strictEqual(ap.json.reviewState, 'approved');

      const done = await request(port, 'GET', '/api/tasks?board=completed', {
        token: usr.token,
      });
      assert.ok(done.json.tasks.some((x) => x.ref === id));

      // public list: link ok, no review notes
      const pub = await request(port, 'GET', '/api/tasks');
      const pt = pub.json.tasks.find((x) => x.ref === id);
      // approved hidden from active public board filter — public default has no board=active
      // public scope still includes approved if public visibility
      if (pt) {
        assert.ok(pt.hasLink);
        assert.ok(!pt.review || pt.review === undefined);
      }

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
