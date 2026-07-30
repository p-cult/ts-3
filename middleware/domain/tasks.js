'use strict';

/**
 * Task view + scope — pure-ish (ref uses crypto like ts-2).
 * Task ID never leaves the server. Client address key = `ref` (HMAC).
 * projectCode on DTO is denormalized display (derived from Task ID when valid).
 */

const { PROFILE, normalizeProfile } = require('./profiles');
const {
  normalizeKind,
  isPublicBoardKind,
  isRestrictedKind,
  kindIcon,
} = require('./kinds');
const { normalizeReviewState } = require('./review');
const { parse, validate } = require('./taskid');
const { refFor } = require('./ref');

/**
 * @param {object} row internal (taskId = full atom)
 * @param {Map|object} [displayNames]
 * @param {{ profile?: number, stages?: object|null, reviewSummary?: object, refSecret?: string }} [opts]
 */
function toPublicTask(row, displayNames, opts = {}) {
  if (!row) return null;
  const names =
    displayNames instanceof Map
      ? displayNames
      : new Map(Object.entries(displayNames || {}));
  const profile = normalizeProfile(opts.profile != null ? opts.profile : 1);
  const kind = normalizeKind(row.kind);
  const link = String(row.link || '').trim();
  const taskId = row.taskId || row.id;
  const parsed = taskId && validate(taskId) ? parse(taskId) : null;

  // projectCode denormalized from atom when possible (not a second identity)
  const projectCode = parsed
    ? parsed.projectCode
    : String(row.projectCode || '');

  const dto = {
    ref: refFor(taskId, opts.refSecret),
    projectCode,
    projectName: row.projectName || '',
    name: row.name || '',
    description: row.description || '',
    notes: row.notes || '',
    status: row.status || 'Draft',
    priority: row.priority || 'normal',
    startDate: row.startDate || '',
    endDate: row.endDate || '',
    assigneeUsername: row.assigneeUsername || '',
    assigneeDisplayName:
      names.get(row.assigneeUsername) ||
      row.assigneeDisplayName ||
      row.assigneeUsername ||
      '',
    visibility: row.visibility || 'public',
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
    hasLink: !!link,
    link: link || '',
    // hierarchy parent as client ref (not Task ID)
    parentRef: row.parentTaskId
      ? refFor(row.parentTaskId, opts.refSecret)
      : null,
    reviewState: normalizeReviewState(row.reviewState),
    linkVersion: Number(row.linkVersion) || 0,
    reviewIteration: Number(row.reviewIteration) || 0,
  };

  if (profile >= PROFILE.SUPER_ADMIN) {
    dto.kind = kind;
    dto.kindIcon = kindIcon(kind);
  } else if (isRestrictedKind(kind)) {
    dto.kind = undefined;
  } else {
    dto.kind = kind === 'sub' ? 'sub' : 'main';
  }

  if (opts.stages && opts.stages.tokens && opts.stages.tokens.length) {
    const total = opts.stages.tokens.length;
    let i = Number(opts.stages.currentIndex) || 0;
    if (i < 0) i = 0;
    if (i > total) i = total;
    dto.stages = {
      tokens: opts.stages.tokens.slice(),
      currentIndex: i,
      total,
      ratio: total ? i / total : 0,
    };
  } else {
    dto.stages = null;
  }

  if (profile >= PROFILE.USER && opts.reviewSummary) {
    dto.review = opts.reviewSummary;
  }

  // Hard law: never leak Task ID or sheet keys
  delete dto.taskId;
  delete dto.id;
  delete dto.parentTaskId;
  delete dto.userSheet;
  return dto;
}

function scopeTasks(depotTasks, actor) {
  const profile = normalizeProfile(actor && actor.profile);
  let list = Array.isArray(depotTasks) ? depotTasks.slice() : [];

  if (profile >= PROFILE.MODERATOR) {
    /* all */
  } else if (profile === PROFILE.USER) {
    const u = String((actor && actor.username) || '');
    list = list.filter((t) => t.assigneeUsername === u);
  } else {
    list = list.filter(
      (t) =>
        String(t.visibility || '').toLowerCase() === 'public' &&
        isPublicBoardKind(t.kind)
    );
  }
  return list;
}

function canViewTask(task, actor) {
  if (!task) return 'not_found';
  const profile = normalizeProfile(actor && actor.profile);
  const kind = normalizeKind(task.kind);
  if (profile >= PROFILE.MODERATOR) return 'ok';
  if (profile === PROFILE.USER) {
    if (task.assigneeUsername === actor.username) return 'ok';
    return 'forbidden';
  }
  if (String(task.visibility || '').toLowerCase() !== 'public') return 'not_found';
  if (!isPublicBoardKind(kind)) return 'not_found';
  return 'ok';
}

/** Nest by parentRef on public DTOs */
function nestHierarchy(publicTasks) {
  const list = Array.isArray(publicTasks) ? publicTasks : [];
  const byRef = new Map(list.map((t) => [t.ref, { ...t, children: [] }]));
  const roots = [];
  for (const t of byRef.values()) {
    if (t.parentRef && byRef.has(t.parentRef)) {
      byRef.get(t.parentRef).children.push(t);
    } else {
      roots.push(t);
    }
  }
  return roots;
}

module.exports = {
  toPublicTask,
  scopeTasks,
  canViewTask,
  nestHierarchy,
  isRestrictedKind,
  refFor,
};
