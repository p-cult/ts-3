'use strict';

/**
 * Slice 15 — Admin task injection (parse → preview → birth hallway).
 */

const assert = require('assert');
const http = require('http');
const { startServer } = require('./server');
const { parseInjectText, applyStatusHints } = require('./domain/inject-parse');
const { planInject } = require('./domain/inject-plan');

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

const WA = `Ashwin | 31st July
Tasks done:

[Cult edits +]
* Rasam promo done (on review)
* Rasam promo done (on review)
* Life art archival ganesh bhat - finding resource (on going)

[Social Media]
* recent edit project files backup done.

[Others]
* photos of team members given to hr.
`;

async function main() {
  console.log('slice 15 tests\n');

  try {
    const wa = parseInjectText(WA);
    assert.strictEqual(wa.format, 'freeform');
    assert.ok(wa.rows.length >= 5);
    assert.ok(wa.rows.some((r) => /rasam/i.test(r.name)));
    const hinted = applyStatusHints('Rasam promo (done; approval awaited)');
    assert.strictEqual(hinted.name, 'Rasam promo');
    assert.strictEqual(hinted.status, 'Done');
    assert.strictEqual(hinted.reviewHint, 'under_review');
    const approved = applyStatusHints('Culture showreel short version changes (done; approved)');
    assert.strictEqual(approved.status, 'Done');
    assert.ok(/culture showreel/i.test(approved.name));
    const json = parseInjectText(
      JSON.stringify([{ name: 'Poster', project: 'Sample Project', assignee: 'anya' }])
    );
    assert.strictEqual(json.format, 'json');
    assert.strictEqual(json.rows[0].name, 'Poster');
    const csv = parseInjectText('name,project,assignee\nCut reel,Other Project,ravi\n');
    assert.strictEqual(csv.format, 'csv');
    assert.strictEqual(csv.rows[0].assigneeHint, 'ravi');
    const tsv = parseInjectText('name\tproject\nassignee task\tSample Project\n');
    assert.strictEqual(tsv.format, 'tsv');
    ok('parse WhatsApp / JSON / CSV / TSV');
  } catch (e) {
    fail('parse', e);
  }

  try {
    const projects = [
      { code: 'CEDT00', name: 'Cult Edits+', label: 'Cult Edits+', pseudoName: 'Cult Video & Design' },
      { code: 'PCSM00', name: 'Social Media', label: 'Social Media' },
      { code: 'OTHR01', name: 'Other 1', label: 'Other 1', pseudoName: 'Regular' },
      { code: 'COLB06', name: 'Collaborations 6', label: 'Collaborations 6', pseudoName: "RaSam'26" },
      { code: 'PRJ001', name: 'Sample Project' },
    ];
    const users = [
      { username: 'ashwin', displayName: 'Ashwin' },
      { username: 'anya', displayName: 'Anya' },
    ];
    const plan = planInject({
      text: WA,
      projects,
      users,
      depot: [],
      defaultAssigneeUsername: 'ashwin',
    });
    assert.ok(plan.summary.batchDuplicates >= 1);
    assert.ok(plan.groups.some((g) => g.batchDuplicate));
    // Edits / Social Media aliases resolve onto master ProjectCodes
    assert.ok(plan.groups.some((g) => g.projectCode === 'CEDT00'));
    assert.ok(plan.groups.some((g) => g.projectCode === 'PCSM00'));
    const multi = planInject({
      text: `Ashwin | 11th July
[Edits+]
* Vande matram edit
Ashwin | 15th July
[Edits]
* Vande matram edit (ongoing)
`,
      projects,
      users,
      depot: [],
    });
    assert.ok(multi.summary.crossDay >= 1 || multi.summary.batchDuplicates >= 1);
    const purged = planInject({
      text: WA,
      projects,
      users,
      depot: [],
      resolutions: Object.fromEntries(
        plan.groups.filter((g) => g.batchDuplicate).map((g) => [g.key, 'purge'])
      ),
    });
    assert.ok(purged.summary.inject >= 4);
    assert.ok(purged.ready.some((r) => r.reason === 'purged' || r.reason === 'purged_duplicate'));
    const split = planInject({
      text: WA,
      projects,
      users,
      depot: [],
      resolutions: Object.fromEntries(
        plan.groups.filter((g) => g.batchDuplicate).map((g) => [g.key, 'split'])
      ),
    });
    assert.ok(split.ready.filter((r) => r.action === 'inject' && r.reason === 'split').length >= 2);
    const withKind = planInject({
      text: `Anya | 2 Aug
[Sample Project]
* Kind demo task
`,
      projects: [{ code: 'PRJ001', name: 'Sample Project' }],
      users: [{ username: 'anya', displayName: 'Anya' }],
      depot: [],
      itemKindOverrides: { c0: 'pseudo' },
    });
    assert.strictEqual(withKind.groups[0].kind, 'pseudo');
    assert.ok(withKind.ready.some((r) => r.action === 'inject' && r.kind === 'pseudo'));
    const normalDefault = planInject({
      text: `Anya | 2 Aug
[Sample Project]
* Kind default task
`,
      projects: [{ code: 'PRJ001', name: 'Sample Project' }],
      users: [{ username: 'anya', displayName: 'Anya' }],
      depot: [],
    });
    assert.strictEqual(normalDefault.groups[0].kind, 'main');
    // Purged duplicate groups always sort to the end of the list
    const ordered = planInject({
      text: `Anya | 2 Aug
[Sample Project]
* Alone ready task
* Dup task alpha
* Dup task alpha
* Mid ready task
`,
      projects: [{ code: 'PRJ001', name: 'Sample Project' }],
      users: [{ username: 'anya', displayName: 'Anya' }],
      depot: [],
    });
    const last = ordered.groups[ordered.groups.length - 1];
    assert.ok(last.batchDuplicate && last.resolution === 'purge', 'purged dup at end');
    assert.ok(ordered.groups.some((g) => !g.batchDuplicate && g.name === 'Alone ready task'));
    const aloneIx = ordered.groups.findIndex((g) => g.name === 'Alone ready task');
    const dupIx = ordered.groups.findIndex((g) => g.name === 'Dup task alpha');
    assert.ok(aloneIx < dupIx, 'ready before purged dup');
    ok('plan maps projects + purge/split duplicates');
  } catch (e) {
    fail('plan', e);
  }

  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  try {
    const health = await request(port, 'GET', '/api/health');
    assert.strictEqual(health.json.slice, '15');
    ok('health slice 15');

    const p2 = await login(port, 'ts3usr1', 'ts3-98860');
    const denied = await request(port, 'POST', '/api/inject/preview', {
      token: p2.token,
      body: { text: WA },
    });
    assert.strictEqual(denied.status, 403);
    ok('P2 cannot preview inject');

    const admin = await login(port, 'ts3admin', 'ts3-98860');
    // Use Sample Project freeform so memory seed projects resolve
    const sampleText = `Anya | 2 Aug
[Sample Project]
* Inject slice15 demo alpha
* Inject slice15 demo alpha
* Inject slice15 demo beta
`;
    const preview = await request(port, 'POST', '/api/inject/preview', {
      token: admin.token,
      body: { text: sampleText, defaultAssigneeUsername: 'anya' },
    });
    assert.strictEqual(preview.status, 200, JSON.stringify(preview.json));
    assert.ok(preview.json.summary.batchDuplicates >= 1);
    const dupKey = preview.json.groups.find((g) => g.batchDuplicate).key;
    const commit = await request(port, 'POST', '/api/inject', {
      token: admin.token,
      body: {
        text: sampleText,
        defaultAssigneeUsername: 'anya',
        resolutions: { [dupKey]: 'purge' },
      },
    });
    assert.strictEqual(commit.status, 200, JSON.stringify(commit.json));
    assert.ok(commit.json.injected >= 2, JSON.stringify(commit.json));
    const tasks = await request(port, 'GET', '/api/tasks', { token: admin.token });
    const names = (tasks.json.tasks || []).map((t) => t.name);
    assert.ok(names.includes('Inject slice15 demo alpha'));
    assert.ok(names.includes('Inject slice15 demo beta'));
    const alphaCount = names.filter((n) => n === 'Inject slice15 demo alpha').length;
    assert.strictEqual(alphaCount, 1, 'purge keeps one alpha');
    ok('admin preview + inject via birth hallway');

    const bridgeOff = await request(port, 'POST', '/api/bridge/refresh', {
      token: admin.token,
      body: {},
    });
    assert.strictEqual(bridgeOff.status, 503);
    assert.strictEqual(bridgeOff.json.ok, false);
    assert.ok(bridgeOff.json.reason);
    const p2Bridge = await request(port, 'POST', '/api/bridge/refresh', {
      token: p2.token,
      body: {},
    });
    assert.strictEqual(p2Bridge.status, 403);
    ok('bridge refresh gated (P4; off without live bridge)');
  } catch (e) {
    fail('http', e);
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
