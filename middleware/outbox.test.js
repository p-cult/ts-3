'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createOutboxStore } = require('./data/outbox-store');

function ok(msg) {
  console.log('ok — ' + msg);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts3-outbox-'));
  const box = createOutboxStore({ dataDir: dir });

  const a = box.enqueue({
    op: 'birth',
    taskId: 'PRJ0011001A01',
    userSheet: 'user-01',
    row: { taskId: 'PRJ0011001A01', name: 'T', userSheet: 'user-01' },
  });
  assert.ok(a.id);
  assert.strictEqual(box.statusForTask('PRJ0011001A01'), 'pending');
  assert.strictEqual(box.stats().pending, 1);

  const claimed = box.claim(5);
  assert.strictEqual(claimed.length, 1);
  assert.strictEqual(claimed[0].status, 'in_flight');

  box.markSynced(claimed[0].id);
  assert.strictEqual(box.statusForTask('PRJ0011001A01'), 'synced');

  box.setRowCache('PRJ0011001A01', { masterRow: 20, userRow: 15, userSheet: 'user-01' });
  assert.strictEqual(box.getRowCache('PRJ0011001A01').masterRow, 20);

  box.purge();
  ok('outbox enqueue/claim/sync/row-cache');

  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
