'use strict';

/**
 * Roles & PATCH gates — pure. Server is the authority.
 */

const { PROFILE, roleCode, roleName, normalizeProfile } = require('./profiles');
const { isRestrictedKind, normalizeKind } = require('./kinds');
const { isMakeTaskEligible } = require('./classifier');
const { ALL_STATUSES, USER_STATUSES, coerceApiStatus } = require('./status');

const PATCH_FIELDS = Object.freeze({
  [PROFILE.USER]: Object.freeze([
    'name', 'description', 'notes', 'startDate', 'endDate', 'status', 'link',
    'parentRef', // sub parent — client ref only
  ]),
  [PROFILE.MODERATOR]: Object.freeze(['status']),
  [PROFILE.SUPER_ADMIN]: Object.freeze([
    'name', 'description', 'notes', 'startDate', 'endDate', 'status',
    'priority', 'assigneeUsername',
    'link', 'kind', 'parentRef',
  ]),
});

function permissionsFor(profile) {
  const p = normalizeProfile(profile);
  return {
    profile: p,
    role: roleCode(p),
    name: roleName(p),
    canCreate: p === PROFILE.USER || p >= PROFILE.SUPER_ADMIN,
    canEdit: p >= PROFILE.USER,
    editScope:
      p >= PROFILE.SUPER_ADMIN
        ? 'all'
        : p === PROFILE.MODERATOR
          ? 'status'
          : p === PROFILE.USER
            ? 'own'
            : 'none',
    canClassify: p >= PROFILE.SUPER_ADMIN,
    canSetKind: p >= PROFILE.SUPER_ADMIN,
    canSetPriority: p >= PROFILE.SUPER_ADMIN,
    canViewReports: p >= PROFILE.MODERATOR,
    canAdmin: p >= PROFILE.SUPER_ADMIN,
    canViewAll: p === PROFILE.PUBLIC || p >= PROFILE.MODERATOR,
    canWrite: p === PROFILE.USER || p >= PROFILE.SUPER_ADMIN,
    canDelete: p >= PROFILE.SUPER_ADMIN,
    canReviewModerate: p >= PROFILE.MODERATOR,
    canReviewSubmit: p >= PROFILE.USER,
    canViewNeedsReview: p >= PROFILE.MODERATOR,
    canViewLogs: p >= PROFILE.USER,
    canBulk: p >= PROFILE.SUPER_ADMIN,
    canDecideQueue: p >= PROFILE.MODERATOR,
    canMakeTask: p >= PROFILE.MODERATOR,
    createsDirect: true,
  };
}

/** P2 creates enqueue when QUEUE_MODE is on; P4 still births direct. */
function mustQueueCreates(profile, queueModeOn) {
  if (!queueModeOn) return false;
  const p = normalizeProfile(profile);
  return p === PROFILE.USER;
}

function deny(status, code, error) {
  return { ok: false, status, code, error };
}

/**
 * @param {object} args
 * @param {number} args.profile
 * @param {object} args.body
 * @param {boolean} [args.ownsTask]
 * @param {string} [args.taskKind]
 * @param {string[]} [args.userAllowedStatuses]
 */
function authorizeTaskPatch(args) {
  const profile = normalizeProfile(args && args.profile);
  const bodyIn = (args && args.body) || {};
  const b = {};
  Object.keys(bodyIn).forEach((k) => {
    b[k] = bodyIn[k];
  });
  const taskKind = normalizeKind(args && args.taskKind);

  if (profile < PROFILE.USER) {
    return deny(401, 'unauthorized', 'sign in to edit tasks');
  }

  // Admin converting main/sub → P/R/N: allow kind (+ optional status) only
  if (
    !isRestrictedKind(taskKind) &&
    b.kind !== undefined &&
    isRestrictedKind(b.kind)
  ) {
    if (profile < PROFILE.SUPER_ADMIN) {
      return deny(403, 'forbidden', 'only the admin can set kind');
    }
    const next = { kind: normalizeKind(b.kind) };
    if (b.status !== undefined) {
      const coerced = coerceApiStatus(b.status);
      if (!coerced) {
        return deny(403, 'forbidden', 'status not allowed');
      }
      b.status = coerced;
      const allowedStatuses = ALL_STATUSES.slice();
      if (!allowedStatuses.includes(b.status)) {
        return deny(403, 'forbidden', 'status not allowed');
      }
      next.status = b.status;
    }
    return { ok: true, body: next };
  }

  // Make Task: P3+ promotes restricted kind → main (clear classifier)
  if (
    isRestrictedKind(taskKind) &&
    b.kind !== undefined &&
    normalizeKind(b.kind) === 'main'
  ) {
    if (profile < PROFILE.MODERATOR) {
      return deny(403, 'forbidden', 'only moderators and admins can make task');
    }
    if (!isMakeTaskEligible({ kind: taskKind })) {
      return deny(403, 'forbidden', 'task is not eligible for make task');
    }
    return { ok: true, body: { kind: 'main' } };
  }

  // Already P/R/N: status only (all roles)
  if (isRestrictedKind(taskKind)) {
    // Clients sometimes echo the current kind; treat same-kind as a no-op.
    if (b.kind !== undefined && normalizeKind(b.kind) === taskKind) {
      delete b.kind;
    }
    const keys = Object.keys(b).filter((k) => b[k] !== undefined);
    const blocked = keys.filter((k) => k !== 'status');
    if (blocked.length) {
      return deny(
        403,
        'forbidden',
        'pseudo/routine/not_a_task tasks only allow status changes'
      );
    }
    if (b.status !== undefined) {
      const coerced = coerceApiStatus(b.status);
      if (!coerced) {
        return deny(403, 'forbidden', 'status not allowed');
      }
      b.status = coerced;
      const allowedStatuses =
        profile < PROFILE.MODERATOR
          ? USER_STATUSES.slice()
          : ALL_STATUSES.slice();
      if (!allowedStatuses.includes(b.status)) {
        return deny(403, 'forbidden', 'status not allowed');
      }
    }
    if (profile === PROFILE.USER && args.ownsTask === false) {
      return deny(403, 'forbidden', 'you can only edit your own tasks');
    }
    return { ok: true, body: b };
  }

  if (
    b.projectCode !== undefined ||
    b.project !== undefined ||
    b.projectName !== undefined
  ) {
    if (profile < PROFILE.SUPER_ADMIN) {
      return deny(403, 'forbidden', 'project cannot be changed after task creation');
    }
  }

  if (b.priority !== undefined && profile < PROFILE.SUPER_ADMIN) {
    return deny(403, 'forbidden', 'only the admin can change priority');
  }

  if (b.assigneeUsername !== undefined && profile < PROFILE.SUPER_ADMIN) {
    return deny(403, 'forbidden', 'only the admin can reassign tasks');
  }

  if (b.kind !== undefined && profile < PROFILE.SUPER_ADMIN) {
    return deny(403, 'forbidden', 'only the admin can set kind');
  }

  delete b.taskId;
  delete b.id;
  delete b.publicId;
  delete b.userSheet;
  delete b.createdAt;
  delete b.updatedAt;
  delete b.projectName;
  delete b.parentTaskId;
  delete b.reviewState;
  delete b.linkVersion;

  const allowed = PATCH_FIELDS[profile] || [];
  const blocked = Object.keys(b).filter((k) => !allowed.includes(k));
  if (blocked.length) {
    if (profile === PROFILE.MODERATOR) {
      return deny(403, 'forbidden', 'moderators may only change status');
    }
    return deny(403, 'forbidden', 'not allowed to change: ' + blocked.join(', '));
  }

  if (b.status !== undefined) {
    const coerced = coerceApiStatus(b.status);
      if (!coerced) {
        return deny(403, 'forbidden', 'status not allowed');
      }
      b.status = coerced;
    const allowedStatuses =
      profile < PROFILE.MODERATOR
        ? (args.userAllowedStatuses && args.userAllowedStatuses.length
          ? args.userAllowedStatuses
          : USER_STATUSES.slice())
        : ALL_STATUSES.slice();
    if (!allowedStatuses.includes(b.status)) {
      return deny(
        403,
        'forbidden',
        'status not allowed; use: ' + allowedStatuses.join(', ')
      );
    }
  }

  if (profile === PROFILE.USER && args.ownsTask === false) {
    return deny(403, 'forbidden', 'you can only edit your own tasks');
  }

  return { ok: true, body: b };
}

function canCreate(profile) {
  const p = normalizeProfile(profile);
  return p === PROFILE.USER || p >= PROFILE.SUPER_ADMIN;
}

function canDelete(profile) {
  return normalizeProfile(profile) >= PROFILE.SUPER_ADMIN;
}

module.exports = {
  PROFILE,
  ALL_STATUSES,
  USER_STATUSES,
  PATCH_FIELDS,
  permissionsFor,
  authorizeTaskPatch,
  canCreate,
  canDelete,
  mustQueueCreates,
  normalizeProfile,
  roleCode,
  roleName,
};
