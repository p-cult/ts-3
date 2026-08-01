'use strict';

const { PROFILE, normalizeProfile } = require('../domain/profiles');
const { canViewTask, toPublicTask } = require('../domain/tasks');
const { forbidden, notFound, badRequest } = require('../errors');

/** P3+ read-only journey: visible task row + side-store history join. */
function createGetJourneyReport({ data }) {
  return {
    async execute({ actor, ref }) {
      const profile = normalizeProfile(actor && actor.profile);
      if (profile < PROFILE.MODERATOR) {
        throw forbidden('journey report requires moderator or admin');
      }
      const key = String(ref || '').trim();
      if (!key) throw badRequest('ref query parameter required');

      const row = data.findByRef(key);
      const view = canViewTask(row, actor || { profile: 1 });
      if (view === 'not_found') throw notFound('task not found');
      if (view === 'forbidden') throw forbidden('not allowed to view this task');

      const joined = data.joinHistory(row.taskId);
      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );
      const stages = data.getStages(row.taskId);

      return {
        ref: key,
        task: toPublicTask(row, nameMap, {
          profile,
          stages,
          refSecret: data.refSecret,
        }),
        journey: joined,
      };
    },
  };
}

module.exports = { createGetJourneyReport };
