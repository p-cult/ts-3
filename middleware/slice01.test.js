'use strict';

/**
 * Slice 01 acceptance checks (SLICE-01.md §7 A–F).
 * Run: node middleware/slice01.test.js
 */

const http = require('http');
const assert = require('assert');
const { startServer } = require('./server');
const { createApp } = require('./app');

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log('  ok  — ' + name);
}
function fail(name, err) {
  failed += 1;
  console.error('  FAIL — ' + name);
  console.error('       ', err && err.stack ? err.stack : err);
}

function request(port, method, path, { body, token, csrf } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    if (csrf) headers['X-CSRF-Token'] = csrf;
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
            json = null;
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

async function login(port, username, password) {
  const r = await request(port, 'POST', '/api/login', {
    body: { username, password },
  });
  assert.strictEqual(r.status, 200, 'login ' + username + ' status');
  return r.json;
}

async function main() {
  console.log('slice 01 tests\n');
  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  const app = server.app;

  try {
    // A — Health & anonymous
    {
      const r = await request(port, 'GET', '/api/health');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.slice, '11');
      assert.ok(r.json.mode && r.json.mode.appMode === 'staging');
      ok('A1 GET /api/health slice 07 + staging');
    }
    {
      const r = await request(port, 'GET', '/api/me');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.role, 'P1');
      assert.strictEqual(r.json.user, null);
      ok('A2 GET /api/me anonymous P1');
    }
    {
      const r = await request(port, 'GET', '/api/tasks');
      assert.strictEqual(r.status, 200);
      const tasks = r.json.tasks || [];
      assert.ok(tasks.every((t) => t.taskId === undefined && t.ref));
      ok('A3 P1 sees only public tasks; no taskId');
    }

    // B — Login
    let anya;
    {
      anya = await login(port, 'anya', 'anya');
      assert.strictEqual(anya.user.role, 'P2');
      ok('B4 login anya P2');
    }
    {
      const r = await request(port, 'POST', '/api/login', {
        body: { username: 'anya', password: 'wrong' },
      });
      assert.strictEqual(r.status, 401);
      ok('B5 bad password 401');
    }
    {
      const mira = await login(port, 'mira', 'mira');
      assert.strictEqual(mira.user.role, 'P3');
      const vinod = await login(port, 'vinod', 'vinod');
      assert.strictEqual(vinod.user.role, 'P4');
      ok('B6 login mira P3 + vinod P4');
    }

    // C — Scope
    {
      const r = await request(port, 'GET', '/api/tasks', { token: anya.token });
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.tasks.every((t) => t.assigneeUsername === 'anya'));
      ok('C7 anya sees only own tasks');
    }
    {
      const mira = await login(port, 'mira', 'mira');
      const r = await request(port, 'GET', '/api/tasks', { token: mira.token });
      const names = r.json.tasks.map((t) => t.assigneeUsername);
      assert.ok(names.includes('anya') && names.includes('ravi'));
      ok('C8 mira sees anya + ravi tasks');
    }
    {
      const all = await request(port, 'GET', '/api/tasks', {
        token: (await login(port, 'vinod', 'vinod')).token,
      });
      const raviTask = all.json.tasks.find((t) => t.assigneeUsername === 'ravi');
      assert.ok(raviTask);
      const r = await request(port, 'GET', '/api/tasks/' + raviTask.ref, {
        token: anya.token,
      });
      assert.ok(r.status === 403 || r.status === 404);
      ok('C9 anya cannot read ravi task');
    }

    // D — Create
    let created;
    {
      const r = await request(port, 'POST', '/api/tasks', {
        token: anya.token,
        body: {
          projectCode: 'PRJ001',
          name: 'Slice01 unique poster ' + Date.now(),
          description: 'test',
        },
      });
      assert.strictEqual(r.status, 201);
      created = r.json.task;
      assert.ok(created.ref);
      assert.strictEqual(created.taskId, undefined);
      assert.strictEqual(created.assigneeUsername, 'anya');
      ok('D10 anya create 201, opaque id, no taskId');
    }
    {
      const r = await request(port, 'POST', '/api/tasks', {
        token: anya.token,
        body: { projectCode: 'NOPE00', name: 'x' },
      });
      assert.strictEqual(r.status, 400);
      ok('D11 unknown project 400');
    }
    {
      const r = await request(port, 'POST', '/api/tasks', {
        body: { projectCode: 'PRJ001', name: 'nope' },
      });
      assert.ok(r.status === 401 || r.status === 403);
      ok('D12 P1 create denied');
    }
    {
      const mira = await login(port, 'mira', 'mira');
      const r = await request(port, 'POST', '/api/tasks', {
        token: mira.token,
        body: { projectCode: 'PRJ001', name: 'mod create' },
      });
      assert.strictEqual(r.status, 403);
      ok('D13 P3 create 403');
    }
    {
      const r = await request(port, 'POST', '/api/tasks', {
        token: anya.token,
        body: {
          projectCode: created.projectCode,
          name: created.name,
        },
      });
      assert.strictEqual(r.status, 409);
      ok('D13b duplicate identity 409');
    }
    {
      const internal = app.data.findByRef(created.ref);
      assert.ok(internal && internal.taskId);
      assert.strictEqual(internal.taskId.length, 13);
      const parts = app.data.partitionsFor(internal.taskId);
      assert.ok(parts && parts.depot && parts.vehicle && parts.mapping);
      assert.strictEqual(parts.mapping.ref, created.ref);
      assert.strictEqual(parts.mapping.taskId, internal.taskId);
      ok('D13c vehicle + depot + mapping after birth');
    }

    // E — Patch
    {
      const r = await request(port, 'PATCH', '/api/tasks/' + created.ref, {
        token: anya.token,
        body: { name: created.name + ' edited' },
      });
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.task.name.endsWith('edited'));
      created = r.json.task;
      ok('E14 anya patch own name');
    }
    {
      const r = await request(port, 'PATCH', '/api/tasks/' + created.ref, {
        token: anya.token,
        body: { priority: 'high' },
      });
      assert.strictEqual(r.status, 403);
      ok('E15 anya patch priority 403');
    }
    {
      const mira = await login(port, 'mira', 'mira');
      const r = await request(port, 'PATCH', '/api/tasks/' + created.ref, {
        token: mira.token,
        body: { status: 'Blocked' },
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.task.status, 'Blocked');
      ok('E16 mira patch status');
    }
    {
      const mira = await login(port, 'mira', 'mira');
      const r = await request(port, 'PATCH', '/api/tasks/' + created.ref, {
        token: mira.token,
        body: { name: 'hacked' },
      });
      assert.strictEqual(r.status, 403);
      ok('E17 mira patch name 403');
    }
    {
      const vinod = await login(port, 'vinod', 'vinod');
      const r = await request(port, 'PATCH', '/api/tasks/' + created.ref, {
        token: vinod.token,
        body: { priority: 'high' },
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.task.priority, 'high');
      ok('E18 vinod patch priority');
    }
    {
      const ravi = await login(port, 'ravi', 'ravi');
      const r = await request(port, 'PATCH', '/api/tasks/' + created.ref, {
        token: ravi.token,
        body: { notes: 'nope' },
      });
      assert.strictEqual(r.status, 403);
      ok('E19 ravi cannot patch anya task');
    }

    // F — Delete
    {
      const r = await request(port, 'DELETE', '/api/tasks/' + created.ref, {
        token: anya.token,
      });
      assert.strictEqual(r.status, 403);
      ok('F20 anya delete 403');
    }
    {
      const vinod = await login(port, 'vinod', 'vinod');
      const r = await request(port, 'DELETE', '/api/tasks/' + created.ref, {
        token: vinod.token,
      });
      assert.strictEqual(r.status, 200);
      const list = await request(port, 'GET', '/api/tasks', { token: vinod.token });
      assert.ok(!list.json.tasks.some((t) => t.ref === created.ref));
      ok('F21 vinod delete removes task');
    }

    // Canonical staging humans (locked credentials)
    {
      const admin = await login(port, 'ts3admin', 'ts3-98860');
      assert.strictEqual(admin.user.role, 'P4');
      assert.strictEqual(admin.user.username, 'ts3admin');
      assert.ok(admin.permissions && admin.permissions.canDelete === true);
      assert.ok(admin.permissions.canCreate === true);

      const usr = await login(port, 'ts3usr1', 'ts3-98860');
      assert.strictEqual(usr.user.role, 'P2');
      assert.strictEqual(usr.user.username, 'ts3usr1');
      assert.ok(usr.permissions && usr.permissions.canCreate === true);
      assert.ok(usr.permissions.canDelete === false);

      // P2 create under canonical user
      const made = await request(port, 'POST', '/api/tasks', {
        token: usr.token,
        body: {
          projectCode: 'PRJ002',
          name: 'Canonical user task ' + Date.now(),
        },
      });
      assert.strictEqual(made.status, 201);
      assert.strictEqual(made.json.task.assigneeUsername, 'ts3usr1');
      assert.strictEqual(made.json.task.taskId, undefined);

      // P4 can set priority on that task
      const pr = await request(port, 'PATCH', '/api/tasks/' + made.json.task.ref, {
        token: admin.token,
        body: { priority: 'high' },
      });
      assert.strictEqual(pr.status, 200);
      assert.strictEqual(pr.json.task.priority, 'high');

      // P2 cannot delete; P4 can
      const d2 = await request(port, 'DELETE', '/api/tasks/' + made.json.task.ref, {
        token: usr.token,
      });
      assert.strictEqual(d2.status, 403);
      const d4 = await request(port, 'DELETE', '/api/tasks/' + made.json.task.ref, {
        token: admin.token,
      });
      assert.strictEqual(d4.status, 200);

      ok('canonical ts3admin P4 + ts3usr1 P2 login and permissions');
    }

    // unit: domain taskid
    {
      const taskid = require('./domain/taskid');
      const id = taskid.nextTaskId({
        projectCode: 'PRJ001',
        employeeSuffix: '1001',
        usedSubtasks: ['A01'],
      });
      assert.strictEqual(id, 'PRJ0011001A02');
      const parts = taskid.parse(id);
      assert.deepStrictEqual(parts, {
        projectCode: 'PRJ001',
        employeeSuffix: '1001',
        subtask: 'A02',
      });
      ok('unit nextTaskId increments (ts-2 atom)');
    }
  } catch (e) {
    fail('suite error', e);
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
