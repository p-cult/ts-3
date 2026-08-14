'use strict';

/**
 * Bridge thin-master parse + auto-fallback client tests (no network).
 */

const assert = require('assert');
const {
  dataRows,
  buildDepotRows,
  buildUserObjects,
  buildProjectObjects,
  findRowByTaskId,
  firstEmptyRow,
  DATA_ROW,
} = require('./bridge/thin-master');
const { createBridgeClient } = require('./bridge/client');

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

function blankRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(['']);
  return rows;
}

async function main() {
  console.log('bridge thin-master / client tests\n');

  try {
    const values = blankRows(DATA_ROW - 1).concat([
      ['TID0019001A01', 'Grant 01', 'Alpha', '', '', 'High', '', '', '', '', 'Active', 'user-01', '', ''],
      ['', '', '', ''],
      ['TID0019001A02', 'Grant 01', 'Beta', '', '', 'Low', '', '', '', '', 'Done', 'user-02', '', 'routine'],
    ]);
    const rows = dataRows(values);
    assert.strictEqual(rows.length, 2);
    ok('dataRows skips header + blank');
  } catch (e) {
    fail('dataRows', e);
  }

  try {
    const task = blankRows(DATA_ROW - 1).concat([
      ['ABC1239001A01', 'P', 'N', 'd', 'n', 'Medium', '', '1', '2', 'v', 'Active', 'user-01', 'j', ''],
    ]);
    const mapping = blankRows(DATA_ROW - 1).concat([
      ['ABC1239001A01', '11', 'user-01', '12'],
    ]);
    const depot = buildDepotRows(task, mapping);
    assert.strictEqual(depot.length, 1);
    assert.strictEqual(depot[0].taskId, 'ABC1239001A01');
    assert.strictEqual(depot[0].userSheet, 'user-01');
    assert.strictEqual(depot[0].status, 'Active');
    ok('buildDepotRows joins mapping userSheet');
  } catch (e) {
    fail('buildDepotRows', e);
  }

  try {
    const users = buildUserObjects(
      blankRows(DATA_ROW - 1).concat([
        ['user-01', 'sheetId1', 'E1', 'Ada | a@x', 'active', '', 'ada', 'pw', '4', ''],
      ])
    );
    assert.strictEqual(users.length, 1);
    assert.strictEqual(users[0].username, 'ada');
    assert.strictEqual(users[0].userSheet, 'user-01');
    ok('buildUserObjects');
  } catch (e) {
    fail('buildUserObjects', e);
  }

  try {
    const projects = buildProjectObjects(
      blankRows(DATA_ROW - 1).concat([
        ['Grant 01', 'GRAN', '01', 'GRAN01', 'Grant 01', 'G1', 'x', 'Yes'],
        ['Dead', 'DEAD', '01', 'DEAD01', 'Dead', '', '', 'No'],
      ])
    );
    assert.strictEqual(projects.length, 1);
    assert.strictEqual(projects[0].code, 'GRAN01');
    ok('buildProjectObjects filters inactive');
  } catch (e) {
    fail('buildProjectObjects', e);
  }

  try {
    const values = blankRows(DATA_ROW - 1).concat([['A'], ['B'], ['']]);
    assert.strictEqual(findRowByTaskId(values, 'B'), DATA_ROW + 1);
    assert.strictEqual(firstEmptyRow(values), DATA_ROW + 2);
    ok('findRowByTaskId / firstEmptyRow');
  } catch (e) {
    fail('row helpers', e);
  }

  try {
    const actions = [];
    const bridge = createBridgeClient({
      bridgeUrl: 'https://example.test/exec',
      bridgeSecret: 'tok',
      masterSheetId: 'master-1',
      bridgeProtocol: 'auto',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        actions.push(body.action);
        if (body.action === 'ping') {
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ ok: false, error: 'unknown action: ping' });
            },
          };
        }
        if (body.action === 'read') {
          const values =
            body.tab === 'task'
              ? blankRows(DATA_ROW - 1).concat([
                  [
                    'XYZ9999001A01',
                    'P',
                    'Live',
                    '',
                    '',
                    'Medium',
                    '',
                    '',
                    '',
                    '',
                    'Active',
                    'user-01',
                    '',
                    '',
                  ],
                ])
              : blankRows(DATA_ROW - 1).concat([['XYZ9999001A01', '11', 'user-01', '11']]);
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ ok: true, data: { values } });
            },
          };
        }
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ ok: false, error: 'unexpected ' + body.action });
          },
        };
      },
    });
    const depot = await bridge.getDepot();
    assert.strictEqual(bridge.protocol, 'thin');
    assert.ok(depot.rows && depot.rows.length === 1);
    assert.strictEqual(depot.rows[0].taskId, 'XYZ9999001A01');
    assert.ok(actions.includes('ping'));
    assert.ok(actions.includes('read'));
    ok('auto-fallback getDepot → thin read');
  } catch (e) {
    fail('auto-fallback', e);
  }

  try {
    const writes = [];
    const { createThinMasterApi } = require('./bridge/thin-master');
    const thin = createThinMasterApi({
      masterId: 'master-1',
      call: async (action, payload) => {
        if (action === 'read') {
          if (payload.tab === 'task' && !payload.spreadsheetId) {
            // Col-A slice from DATA_ROW
            return { ok: true, data: { values: [['DEL0019001A01'], ['KEEP9001A01']] } };
          }
          if (payload.tab === 'mapping' && !payload.spreadsheetId) {
            return { ok: true, data: { values: [['DEL0019001A01']] } };
          }
          if (payload.tab === 'users') {
            return {
              ok: true,
              data: {
                values: blankRows(DATA_ROW - 1).concat([
                  ['user-01', 'sheet-u1', '', 'Ada', 'active', '', 'ada', 'pw', '4', ''],
                ]),
              },
            };
          }
          if (payload.tab === 'task' && payload.spreadsheetId === 'sheet-u1') {
            return { ok: true, data: { values: [['DEL0019001A01']] } };
          }
          return { ok: true, data: { values: [] } };
        }
        if (action === 'write') {
          writes.push(payload);
          return { ok: true };
        }
        throw new Error('unexpected ' + action);
      },
    });
    const out = await thin.clearTaskSheets({
      taskId: 'DEL0019001A01',
      userSheet: 'user-01',
    });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.data.masterRow, DATA_ROW);
    assert.ok(writes.some((w) => w.tab === 'task' && !w.spreadsheetId && /A11:N11/.test(w.range)));
    assert.ok(writes.some((w) => w.spreadsheetId === 'sheet-u1' && /A11:K11/.test(w.range)));
    assert.ok(writes.some((w) => w.tab === 'mapping'));
    ok('clearTaskSheets blanks Master + vehicle + mapping');
  } catch (e) {
    fail('clearTaskSheets', e);
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
