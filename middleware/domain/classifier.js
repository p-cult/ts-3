'use strict';

/**
 * Classifier / completed counting — pure.
 * Logged tab kinds vs pure tasks; one rule for metrics and board filters.
 */

const { normalizeKind, isRestrictedKind } = require('./kinds');
const { normalizeReviewState } = require('./review');
const { isFinishedStatus } = require('./status');

/** Kinds shown on the Logged board tab (diary / action-taken). */
const LOGGED_KINDS = Object.freeze(['routine', 'not_a_task']);

/** Kinds P3+ may promote to main via Make Task. */
const MAKE_TASK_KINDS = Object.freeze(['routine', 'pseudo', 'not_a_task']);

function isLoggedKind(k) {
  return LOGGED_KINDS.includes(normalizeKind(k));
}

function isMakeTaskEligible(task) {
  if (!task) return false;
  return MAKE_TASK_KINDS.includes(normalizeKind(task.kind));
}

/** Action-taken / diary row — never counts as approved. Open Logged only. */
function countsAsLogged(task) {
  if (!isLoggedKind(task && task.kind)) return false;
  if (isFinishedStatus(task && task.status)) return false;
  return true;
}

/** Pure task approved by review — eligible for approved metrics. */
function countsAsApproved(task) {
  if (!task || isRestrictedKind(task.kind)) return false;
  return normalizeReviewState(task.reviewState) === 'approved';
}

/**
 * Completed tab / totals: Done status.
 * Pure tasks (main/sub) always; routine/not_a_task when Done (they leave Logged).
 */
function countsAsCompleted(task) {
  if (!task) return false;
  if (!isFinishedStatus(task.status)) return false;
  if (!isRestrictedKind(task.kind)) return true;
  return isLoggedKind(task.kind);
}

module.exports = {
  LOGGED_KINDS,
  MAKE_TASK_KINDS,
  isLoggedKind,
  isMakeTaskEligible,
  countsAsLogged,
  countsAsApproved,
  countsAsCompleted,
};
