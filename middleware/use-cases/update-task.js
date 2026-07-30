'use strict';

const { authorizeTaskPatch, normalizeProfile } = require('../domain/roles');
const { canViewTask, toPublicTask } = require('../domain/tasks');
const { guardDuplicate, normName } = require('../domain/identity');
const { normalizeKind } = require('../domain/kinds');
const { nextLinkVersion } = require('../domain/review');
const {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflict,
  AppError,
} = require('../errors');

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

      // parent via parentRef (or legacy parentPublicId)
      const parentKey =
        patch.parentRef !== undefined
          ? patch.parentRef
          : patch.parentPublicId !== undefined
            ? patch.parentPublicId
            : undefined;
      delete patch.parentRef;
      delete patch.parentPublicId;

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

      patch.updatedAt = new Date().toISOString();

      const updated = data.updateByTaskId(row.taskId, patch);
      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );
      const stages = data.getStages(updated.taskId);
      return {
        task: toPublicTask(updated, nameMap, {
          profile: actor.profile,
          stages,
          refSecret,
        }),
      };
    },
  };
}

module.exports = { createUpdateTask };
