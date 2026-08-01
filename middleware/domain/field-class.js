'use strict';

/**
 * Field classes — Visible / Invisible / Derived.
 *
 * VISIBLE  → may live on vehicle + depot (sheet-shaped core + app row meta).
 * INVISIBLE → side-store only (stages detail, review history/notes). Never birth/update into sheets.
 * DERIVED  → computed for DTOs / joins; never persisted as source of truth.
 */

/** @typedef {'visible'|'invisible'|'derived'} FieldClass */

const VISIBLE_FIELDS = Object.freeze([
  'taskId',
  'projectCode',
  'projectName',
  'name',
  'description',
  'notes',
  'status',
  'priority',
  'link',
  'linkVersion',
  'links',
  'ratings',
  'startDate',
  'endDate',
  'assigneeUsername',
  'userSheet',
  'kind',
  'parentTaskId',
  'reviewState',
  'reviewIteration',
  'createdAt',
  'updatedAt',
]);

const INVISIBLE_FIELDS = Object.freeze([
  'stages',
  'stagesTokens',
  'stageTokens',
  'stagesDetail',
  'reviews',
  'reviewHistory',
  'reviewNotes',
  'history',
]);

const DERIVED_FIELDS = Object.freeze([
  'ref',
  'id',
  'publicId',
  'hasLink',
  'kindIcon',
  'assigneeDisplayName',
  'stagesSummary',
  'parentRef',
  'conflictRef',
  'review',
]);

const VISIBLE = new Set(VISIBLE_FIELDS);
const INVISIBLE = new Set(INVISIBLE_FIELDS);
const DERIVED = new Set(DERIVED_FIELDS);

/**
 * @param {string} key
 * @returns {FieldClass}
 */
function classifyField(key) {
  const k = String(key || '');
  if (INVISIBLE.has(k)) return 'invisible';
  if (DERIVED.has(k)) return 'derived';
  if (VISIBLE.has(k)) return 'visible';
  // Unknown keys default visible so adapters can grow without silent drop —
  // but they still must not be in INVISIBLE.
  return 'visible';
}

/**
 * @param {object} row
 * @returns {string[]} invisible keys present
 */
function invisibleKeysIn(row) {
  if (!row || typeof row !== 'object') return [];
  return Object.keys(row).filter((k) => classifyField(k) === 'invisible');
}

/**
 * @param {object} row
 * @returns {object} only visible (+ unknown-as-visible) fields; strips derived + invisible
 */
function pickVisibleFields(row) {
  if (!row || typeof row !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const cls = classifyField(k);
    if (cls === 'invisible' || cls === 'derived') continue;
    out[k] = v;
  }
  return out;
}

/**
 * Throw if any invisible field is present (birth/update must refuse).
 * @param {object} row
 * @param {string} [context]
 */
function refuseInvisibleFields(row, context) {
  const bad = invisibleKeysIn(row);
  if (!bad.length) return;
  const where = context ? context + ': ' : '';
  const err = new Error(
    where + 'invisible fields cannot write to vehicle/depot: ' + bad.join(', ')
  );
  err.code = 'INVISIBLE_FIELD';
  err.fields = bad;
  throw err;
}

/**
 * Join visible depot row + side-store history for reports/logs.
 * @param {object} row depot/vehicle row
 * @param {{ stages?: object|null, reviews?: object[] }} side
 */
function joinVisibleAndHistory(row, side) {
  const stages = side && side.stages ? side.stages : null;
  const reviews = side && Array.isArray(side.reviews) ? side.reviews : [];
  const visible = pickVisibleFields(row);
  return {
    ...visible,
    stagesSummary: stages
      ? (Number(stages.currentIndex) || 0) + '/' + ((stages.tokens || []).length)
      : '',
    stagesTokens: stages && Array.isArray(stages.tokens) ? stages.tokens.slice() : [],
    stages: stages
      ? {
          tokens: (stages.tokens || []).slice(),
          currentIndex: Number(stages.currentIndex) || 0,
        }
      : null,
    reviewCount: reviews.length,
    lastReview: reviews.length ? { ...reviews[reviews.length - 1] } : null,
    reviewHistory: reviews.map((x) => ({ ...x })),
  };
}

module.exports = {
  VISIBLE_FIELDS,
  INVISIBLE_FIELDS,
  DERIVED_FIELDS,
  classifyField,
  invisibleKeysIn,
  pickVisibleFields,
  refuseInvisibleFields,
  joinVisibleAndHistory,
};
