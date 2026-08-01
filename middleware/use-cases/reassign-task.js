'use strict';

const { unauthorized, forbidden, notFound, badRequest } = require('../errors');
const { PROFILE, normalizeProfile } = require('../domain/profiles');
const { toPublicTask } = require('../domain/tasks');

function createReassignTask({ data }) {
  const refSecret = data.refSecret;
  return {
    async execute({ actor, id, assigneeUsername }) {
      if (!actor || !actor.authenticated) {
        throw unauthorized('sign in to reassign tasks');
      }
      const profile = normalizeProfile(actor.profile);
      if (profile < PROFILE.MODERATOR) {
        throw forbidden('only P3/P4 can reassign tasks');
      }

      const row = data.findByRef(id);
      if (!row) throw notFound('task not found');

      if (!assigneeUsername || typeof assigneeUsername !== 'string') {
        throw badRequest('assigneeUsername is required');
      }

      const target = data.findUser(String(assigneeUsername).trim());
      if (!target) throw badRequest('assignee user not found');

      // ONLY assignee mapping. Freeze everything else including Task ID atom, ref, subTag etc.
      const updated = data.reassignByTaskId ? 
        data.reassignByTaskId(row.taskId, target.username, target.userSheet) :
        data.updateByTaskId(row.taskId, { assigneeUsername: target.username, userSheet: target.userSheet });

      if (!updated) throw notFound('task not found');

      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );

      return {
        task: toPublicTask(updated, nameMap, {
          profile: actor.profile,
          refSecret,
        }),
      };
    },
  };
}

module.exports = { createReassignTask };
