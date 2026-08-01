'use strict';

/**
 * SubTag (subtask id) — pure helpers.
 * Separate from Task ID atom (13-char project+user+sequence).
 * Only for kind === 'sub'.
 * Format: -a0 … -a9 -b0 … -z9
 * Uniqueness per parent only.
 */

const SUBTAG_RE = /^-[A-Za-z][0-9]$/;

function normalizeSubTag(tag) {
  if (tag == null || tag === '') return null;
  const s = String(tag).trim().toLowerCase();
  if (SUBTAG_RE.test(s)) return s;
  return null;
}

function isValidSubTag(tag) {
  return normalizeSubTag(tag) !== null;
}

function assertSubTagFormat(tag) {
  if (tag != null && !isValidSubTag(tag)) {
    const e = new Error('subTag must match -a0 to -z9 format');
    e.code = 'INVALID_SUBTAG';
    throw e;
  }
}

/**
 * nextSubTag for siblings under one parent.
 * Order: -a0..-a9, -b0..-b9, … -z9
 */
function nextSubTag(existingTags = []) {
  const used = new Set(
    existingTags
      .map(normalizeSubTag)
      .filter(Boolean)
  );

  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (const letter of letters) {
    for (let n = 0; n <= 9; n++) {
      const candidate = `-${letter}${n}`;
      if (!used.has(candidate)) {
        return candidate;
      }
    }
  }

  const e = new Error('subTag sequence exhausted under this parent (-a0 to -z9)');
  e.code = 'SUBTAG_OVERFLOW';
  throw e;
}

module.exports = {
  SUBTAG_RE,
  normalizeSubTag,
  isValidSubTag,
  assertSubTagFormat,
  nextSubTag,
};
