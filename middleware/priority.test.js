/** Tests for the priority engine (middleware/priority.js). Run: node middleware/priority.test.js */

'use strict';

const assert = require('assert');
const pri = require('./priority');

let passed = 0;
let failed = 0;
function t(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failed += 1;
    console.error('FAIL', name, '-', e.message);
  }
}

// Fixed "now" so the tests never drift: 10-Jul 12:00
const NOW = new Date(new Date().getFullYear(), 6, 10, 12, 0);
const task = (over) => Object.assign({
  id: 'T1',
  priority: 'normal',
  status: 'Active',
  startDate: '01-Jul | 00:00',
  endDate: '21-Jul | 00:00', // 20-day life, ~47% elapsed at NOW
}, over);

t('mid-life task -> normal from the clock', () => {
  const r = pri.compute(task(), {}, NOW);
  assert.strictEqual(r.priority, 'normal');
  assert.strictEqual(r.source, 'clock');
  assert.strictEqual(r.overdue, false);
});

t('young task (<40% elapsed) -> low', () => {
  const r = pri.compute(task({ endDate: '30-Jul | 00:00' }), {}, NOW);
  assert.strictEqual(r.priority, 'low');
});

t('old task (>=80% elapsed) -> high', () => {
  const r = pri.compute(task({ endDate: '11-Jul | 00:00' }), {}, NOW);
  assert.strictEqual(r.priority, 'high');
});

t('past deadline -> high + overdue', () => {
  const r = pri.compute(task({ endDate: '05-Jul | 00:00' }), {}, NOW);
  assert.strictEqual(r.priority, 'high');
  assert.strictEqual(r.overdue, true);
});

t('Done task keeps stored priority, never overdue', () => {
  const r = pri.compute(task({ status: 'Done', endDate: '05-Jul | 00:00' }), {}, NOW);
  assert.strictEqual(r.priority, 'normal');
  assert.strictEqual(r.overdue, false);
  assert.strictEqual(r.source, 'stored');
});

t('admin override wins while the deadline is unchanged', () => {
  const r = pri.compute(
    task({ priority: 'low' }),
    { T1: { deadline: '21-Jul | 00:00' } },
    NOW
  );
  assert.strictEqual(r.priority, 'low');
  assert.strictEqual(r.source, 'override');
});

t('past deadline beats override → high + overdue (brick red)', () => {
  const r = pri.compute(
    task({ priority: 'low', endDate: '05-Jul | 00:00' }),
    { T1: { deadline: '05-Jul | 00:00' } },
    NOW
  );
  assert.strictEqual(r.priority, 'high');
  assert.strictEqual(r.overdue, true);
  assert.strictEqual(r.source, 'clock');
});

t('override expires when the deadline changes -> clock resumes', () => {
  const r = pri.compute(
    task({ priority: 'low' }),
    { T1: { deadline: '15-Jul | 00:00' } },
    NOW
  );
  assert.strictEqual(r.source, 'clock');
  assert.strictEqual(r.priority, 'normal');
});

t('no deadline -> stored priority', () => {
  const r = pri.compute(task({ endDate: '' }), {}, NOW);
  assert.strictEqual(r.priority, 'normal');
  assert.strictEqual(r.source, 'stored');
});

t('unparseable dates never throw', () => {
  const r = pri.compute(task({ endDate: 'garbage', startDate: '??' }), {}, NOW);
  assert.strictEqual(r.source, 'stored');
});

t('Medium alias normalizes to normal', () => {
  const r = pri.compute(task({ priority: 'Medium', endDate: '' }), {}, NOW);
  assert.strictEqual(r.priority, 'normal');
});

t('applyAll stamps priority/overdue onto every task', () => {
  const list = [task(), task({ id: 'T2', endDate: '05-Jul | 00:00' })];
  pri.applyAll(list, NOW);
  assert.strictEqual(list[0].priority, 'normal');
  assert.strictEqual(list[1].overdue, true);
  assert.strictEqual(list[1].priority, 'high');
});

console.log(`priority: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
