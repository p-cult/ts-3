'use strict';

/**
 * Live Master column L + vehicle sheet keys are user-01 … user-NN
 * as defined on the users tab — never invent or remap by person name.
 *
 * Earlier code forced Vinod → user-01; live Master has Admin on user-01
 * and Vinod on user-02. That rewrite dropped user-02 from the users map
 * and leaked the sheet key into assigneeDisplayName on the board.
 */

function isMasterUserSheetKey(s) {
  return /^user-\d{1,2}$/i.test(String(s || '').trim());
}

function isVinodIdentity(row) {
  const u = String((row && row.username) || (row && row.assigneeUsername) || '')
    .trim()
    .toLowerCase();
  const d = String((row && row.displayName) || (row && row.assigneeDisplayName) || '')
    .trim()
    .toLowerCase();
  return u === 'vinod' || d === 'vinod';
}

/**
 * Users-tab key for a person / task assignee row.
 * Trusts row.userSheet when it is a Master key (user-NN). Does not remap identities.
 * @param {{ username?: string, assigneeUsername?: string, displayName?: string, assigneeDisplayName?: string, userSheet?: string }=} row
 * @returns {string}
 */
function canonicalUserSheet(row) {
  const raw = String((row && row.userSheet) || '').trim();
  if (isMasterUserSheetKey(raw)) return raw;
  return '';
}

/**
 * Keep users-tab sheet keys as published by Master / fixtures.
 * Never rewrite one person's key onto another's slot.
 */
function normalizeUserSheetOnUser(user) {
  if (!user) return user;
  const raw = String(user.userSheet || '').trim();
  if (!raw) return user;
  if (isMasterUserSheetKey(raw) && raw !== user.userSheet) {
    return { ...user, userSheet: raw };
  }
  return user;
}

/** @deprecated Use the users-tab key for the person; do not assume Vinod = user-01. */
const VINOD_USER_SHEET = 'user-01';

module.exports = {
  VINOD_USER_SHEET,
  isMasterUserSheetKey,
  isVinodIdentity,
  canonicalUserSheet,
  normalizeUserSheetOnUser,
};
