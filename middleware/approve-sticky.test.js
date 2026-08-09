'use strict';

/**
 * Completion-approved stickiness: hydrate must not demote Approved back to open work.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSheetsData } = require('./data/sheets');
const { createOutboxStore } = require('./data/outbox-store');
const { TASK_APPROVED_MARK, hasTaskApprovedMark } = require('./data/sheet-row');
const { countsAsLogged } = require('./domain/classifier');

function ok(msg) {
  console.log('ok — ' + msg);
}

async function main() {
  assert.strictEqual(
    countsAsLogged({ kind: 'routine', status: 'Active' }),
    true
  );
  assert.strictEqual(
    countsAsLogged({ kind: 'routine', status: 'Done' }),
    false,
    'Done routine must leave Logged'
  );
  ok('countsAsLogged excludes Done');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts3-approve-sticky-'));
  const outbox = createOutboxStore({ dataDir: path.join(dir, 'outbox') });

  let depotRows = [
    {
      taskId: 'PRJ0011001A01',
      name: 'Sticky approve',
      status: 'Approved',
      notes: TASK_APPROVED_MARK,
      userSheet: 'user-01',
      assignedTo: 'user-01',
    },
  ];

  const bridge = {
    configured: true,
    async getUsers() {
      return {
        users: [
          {
            username: 'admin',
            displayName: 'Admin',
            userSheet: 'user-01',
            role: 'admin',
          },
        ],
      };
    },
    async getProjects() {
      return { projects: [{ code: 'PRJ', name: 'Project' }] };
    },
    async getDepot() {
      return { rows: depotRows };
    },
    async writeDepot() {
      return { ok: true, data: { masterRow: 2 } };
    },
    async writeVehicle() {
      return { ok: true, data: { userRow: 2 } };
    },
    async ping() {
      return { ok: true };
    },
  };

  const sheets = createSheetsData({
    useLiveBridge: true,
    bridge,
    outbox,
    dataDir: dir,
    appMode: 'production',
    writerOfRecord: 'ts3',
    log: { info() {}, warn() {}, debug() {} },
  });

  let r = await sheets.refreshFromBridge();
  assert.strictEqual(r.ok, true);
  let row = sheets.findByTaskId('PRJ0011001A01');
  assert.strictEqual(row.status, 'Done');
  assert.ok(hasTaskApprovedMark(row.notes));
  ok('Approved sheet → Done + mark');

  // Simulate Master still showing Completed (write not visible yet) after approve in mirror.
  outbox.enqueue({
    op: 'patch',
    taskId: 'PRJ0011001A01',
    userSheet: 'user-01',
    row: {
      taskId: 'PRJ0011001A01',
      status: 'Done',
      notes: TASK_APPROVED_MARK + '\nsticky',
      userSheet: 'user-01',
    },
  });
  depotRows = [
    {
      taskId: 'PRJ0011001A01',
      name: 'Sticky approve',
      status: 'Completed',
      notes: '',
      userSheet: 'user-01',
      assignedTo: 'user-01',
    },
  ];
  r = await sheets.refreshFromBridge();
  assert.strictEqual(r.ok, true);
  row = sheets.findByTaskId('PRJ0011001A01');
  assert.strictEqual(row.status, 'Done');
  assert.ok(hasTaskApprovedMark(row.notes), 'hydrate must restore approval mark');
  ok('hydrate restores approval when sheet lags behind');

  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
