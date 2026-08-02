'use strict';

const { authorizeTaskPatch, normalizeProfile } = require('../domain/roles');
const { PROFILE } = require('../domain/profiles');
const { canViewTask, toPublicTask } = require('../domain/tasks');
const { guardDuplicate, normName } = require('../domain/identity');
const { normalizeKind } = require('../domain/kinds');
const { nextLinkVersion, hasDisqualifyingDoneRating } = require('../domain/review');
const {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflict,
  AppError,
} = require('../errors');
const {
  canonicalUserSheet,
  isVinodIdentity,
} = require('../domain/user-sheet');
const { recordOverride, applyAll, normalizePriority } = require('../priority');

function createUpdateTask({ data }) {
  const refSecret = data.refSecret;
  return {
    async execute({ actor, id, body }) {
      // id param = client ref (ts-2)
      if (!actor || !actor.authenticated) {
        throw unauthorized('sign in to edit tasks');
      }

      const row = data.findByRef(id);
      if (!row) throw notFound('task not found');

      const view = canViewTask(row, actor);
      if (view === 'forbidden') throw forbidden('not allowed to edit this task');
      if (view === 'not_found') throw notFound('task not found');

      const ownsTask = row.assigneeUsername === actor.username;
      const authz = authorizeTaskPatch({
        profile: actor.profile,
        body: body || {},
        ownsTask,
        taskKind: row.kind,
      });
      if (!authz.ok) {
        throw new AppError(authz.code || 'forbidden', authz.error, {
          status: authz.status,
        });
      }

      const patch = { ...authz.body };

      if (Array.isArray(patch.links) && patch.links.length > 4) {
        throw badRequest('maximum 4 links allowed');
      }
      if (Array.isArray(patch.ratings) && patch.ratings.length > 4) {
        throw badRequest('maximum 4 links allowed');
      }

      // DONE GATE (non-admin): 1★ / unrated links — skip for routine/pseudo/not_a_task
      if (patch.status === 'Done') {
        const prof = normalizeProfile(actor.profile);
        const kind = normalizeKind(row.kind);
        const logged =
          kind === 'routine' || kind === 'pseudo' || kind === 'not_a_task';
        if (prof < PROFILE.SUPER_ADMIN && !logged) {
          const reviews = data.getReviews(row.taskId) || [];
          const last = reviews.length ? reviews[reviews.length - 1] : null;
          const ratings = (last && last.ratings) || [];
          const hasLink = !!(row.link && String(row.link).trim());
          if (hasDisqualifyingDoneRating(ratings, hasLink)) {
            throw new AppError('forbidden', 'cannot set status to Done while a 1★ rating exists or links are unrated', { status: 403 });
          }
        }
      }

      // projectCode change: denormalized only — Task ID atom unchanged (forbid for non-admin already)
      if (patch.projectCode) {
        const p = data.findProject(patch.projectCode);
        if (!p) throw badRequest('unknown project');
        // Do not re-mint; refuse changing project away from atom
        const { parse, validate } = require('../domain/taskid');
        if (validate(row.taskId)) {
          const parts = parse(row.taskId);
          if (parts && parts.projectCode !== p.code) {
            throw badRequest('project is fixed in Task ID and cannot be changed');
          }
        }
        patch.projectCode = p.code;
        patch.projectName = p.name;
      }

      if (patch.assigneeUsername) {
        const u = data.findUser(patch.assigneeUsername);
        if (!u) throw badRequest('assignee user not found');
        patch.assigneeUsername = u.username;
        patch.userSheet = u.userSheet;
      }

      // parent via parentRef (client opaque ref only)
      const parentKey =
        patch.parentRef !== undefined
          ? patch.parentRef
          : undefined;
      delete patch.parentRef;

      if (parentKey !== undefined) {
        if (parentKey === null || parentKey === '') {
          patch.parentTaskId = null;
          if (normalizeKind(patch.kind || row.kind) === 'sub') patch.kind = 'main';
        } else {
          const parent = data.findByRef(String(parentKey));
          if (!parent) throw badRequest('parent task not found');
          if (parent.taskId === row.taskId) {
            throw badRequest('task cannot be its own parent');
          }
          patch.parentTaskId = parent.taskId;
          patch.kind = 'sub';
        }
      }

      if (patch.kind !== undefined) {
        patch.kind = normalizeKind(patch.kind);
        if (patch.kind !== 'sub') patch.parentTaskId = null;
      }

      if (patch.link !== undefined) {
        const newLink = String(patch.link || '').trim();
        patch.link = newLink;
        patch.linkVersion = nextLinkVersion(row.linkVersion, row.link, newLink);
      }

      if (patch.name || patch.assigneeUsername) {
        const candidate = {
          projectCode: row.projectCode,
          name: patch.name != null ? patch.name : row.name,
          assigneeUsername: patch.assigneeUsername || row.assigneeUsername,
        };
        void normName(candidate.name);
        const dup = guardDuplicate(data.listDepot(), candidate, {
          excludeTaskId: row.taskId,
        });
        if (!dup.ok) {
          throw conflict('duplicate task identity', {
            conflictRef: data.refFor(dup.conflictTaskId),
          });
        }
      }

      if (patch.name != null) patch.name = String(patch.name).trim();
      if (patch.name === '') throw badRequest('name cannot be empty');

      if (patch.priority !== undefined) {
        patch.priority = normalizePriority(patch.priority);
      }

      // Vinod edits stay on his users-tab sheet key (live: user-02, not assumed user-01).
      if (isVinodIdentity(actor)) {
        patch.assigneeUsername = actor.username;
        const me = data.findUser(actor.username);
        const sheet =
          (me && (canonicalUserSheet(me) || String(me.userSheet || '').trim()))
          || '';
        if (sheet) patch.userSheet = sheet;
      } else {
        const who = patch.assigneeUsername || row.assigneeUsername;
        const sheet = canonicalUserSheet({
          assigneeUsername: who,
          assigneeDisplayName: row.assigneeDisplayName,
          userSheet: patch.userSheet || row.userSheet,
        });
        if (sheet) patch.userSheet = sheet;
      }

      patch.updatedAt = new Date().toISOString();

      const updated = await Promise.resolve(data.updateByTaskId(row.taskId, patch));

      // P4 hand-set priority pins while deadline string stays the same.
      if (patch.priority !== undefined) {
        const pub = toPublicTask(updated, new Map(), { refSecret });
        const key = pub && pub.ref;
        if (key) {
          recordOverride(key, updated.endDate || '', 'admin');
        }
      }

      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );
      const stages = data.getStages(updated.taskId);
      const task = toPublicTask(updated, nameMap, {
        profile: actor.profile,
        stages,
        refSecret,
      });
      if (task) {
        applyAll([task]);
        task.syncStatus =
          updated.syncStatus ||
          (data.syncStatusForTask && data.syncStatusForTask(updated.taskId)) ||
          'synced';
      }
      return { task };
    },
  };
}

module.exports = { createUpdateTask };
