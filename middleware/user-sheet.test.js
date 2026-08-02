'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalUserSheet,
  normalizeUserSheetOnUser,
  isMasterUserSheetKey,
} = require('./domain/user-sheet');
const { normalizeSheetTaskRow } = require('./data/sheet-row');

describe('user-sheet — trust users-tab keys', () => {
  it('does not remap Vinod onto user-01 when live key is user-02', () => {
    const vinod = {
      username: 'vinod',
      displayName: 'Vinod',
      userSheet: 'user-02',
    };
    assert.equal(canonicalUserSheet(vinod), 'user-02');
    assert.equal(normalizeUserSheetOnUser(vinod).userSheet, 'user-02');
  });

  it('keeps Admin on user-01 without colliding Vinod', () => {
    const admin = {
      username: 'admin',
      displayName: 'Admin',
      userSheet: 'user-01',
    };
    const vinod = normalizeUserSheetOnUser({
      username: 'vinod',
      displayName: 'Vinod',
      userSheet: 'user-02',
    });
    assert.equal(canonicalUserSheet(admin), 'user-01');
    assert.equal(vinod.userSheet, 'user-02');
    assert.notEqual(vinod.userSheet, admin.userSheet);
  });

  it('does not treat Assigned To sheet keys as display names', () => {
    const row = normalizeSheetTaskRow({
      taskId: 'OTH0011001A01',
      project: 'Other 1',
      name: 'approvals & review',
      status: 'Active',
      assignedTo: 'user-02',
    });
    assert.ok(row);
    assert.equal(row.assigneeDisplayName, '');
    assert.ok(isMasterUserSheetKey('user-02'));
  });
});
