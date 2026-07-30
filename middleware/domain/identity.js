'use strict';

/**
 * Duplicate identity guard — pure.
 * Key: projectCode + name + assigneeUsername (case-insensitive name).
 */

function normName(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function identityKey(task) {
  const project = String((task && task.projectCode) || '').toUpperCase();
  const name = normName(task && task.name);
  const who = String((task && task.assigneeUsername) || '').toLowerCase();
  return project + '|' + name + '|' + who;
}

/**
 * @param {object[]} existingTasks depot rows
 * @param {{ projectCode, name, assigneeUsername }} candidate
 * @param {{ excludeTaskId?: string }} [opts]
 */
function guardDuplicate(existingTasks, candidate, opts = {}) {
  const key = identityKey(candidate);
  if (!candidate || !normName(candidate.name)) {
    return { ok: false, reason: 'empty_name' };
  }
  for (const t of existingTasks || []) {
    const tid = t.taskId || t.id;
    if (opts.excludeTaskId && tid === opts.excludeTaskId) continue;
    if (identityKey(t) === key) {
      return {
        ok: false,
        reason: 'duplicate',
        conflictTaskId: t.taskId || t.id,
      };
    }
  }
  return { ok: true };
}

module.exports = {
  normName,
  identityKey,
  guardDuplicate,
};
