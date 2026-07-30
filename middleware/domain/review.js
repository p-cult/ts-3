'use strict';

/**
 * Review workflow — pure helpers.
 * States: none | under_review | rework | approved
 * Legacy alias: sent_back → rework
 */

const REVIEW_STATES = Object.freeze([
  'none',
  'under_review',
  'rework',
  'approved',
]);

function normalizeReviewState(s) {
  let v = String(s || 'none').trim().toLowerCase();
  if (v === 'sent_back') v = 'rework';
  return REVIEW_STATES.includes(v) ? v : 'none';
}

function canSubmitReview(profile) {
  return Number(profile) >= 2;
}

function canModerateReview(profile) {
  return Number(profile) >= 3; // P3 + P4
}

/**
 * When owner sets a new non-empty link different from last, bump version.
 */
function nextLinkVersion(prevVersion, prevLink, newLink) {
  const a = String(prevLink || '').trim();
  const b = String(newLink || '').trim();
  const v = Number(prevVersion) || 0;
  if (!b) return v;
  if (b !== a) return (v || 0) + 1;
  return v || (b ? 1 : 0);
}

/** Iteration bumps on each rework action. */
function nextIteration(prev) {
  const n = Number(prev) || 0;
  return n + 1;
}

module.exports = {
  REVIEW_STATES,
  normalizeReviewState,
  canSubmitReview,
  canModerateReview,
  nextLinkVersion,
  nextIteration,
};
