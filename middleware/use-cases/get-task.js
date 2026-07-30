'use strict';

const { canViewTask, toPublicTask } = require('../domain/tasks');
const { PROFILE, normalizeProfile } = require('../domain/profiles');
const { notFound, forbidden } = require('../errors');

function createGetTask({ data }) {
  return {
    async execute({ actor, id }) {
      const profile = normalizeProfile(actor && actor.profile);
      const row = data.findByRef(id);
      const view = canViewTask(row, actor || { profile: 1 });
      if (view === 'not_found') throw notFound('task not found');
      if (view === 'forbidden') throw forbidden('not allowed to view this task');

      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );
      const stages = data.getStages(row.taskId);
      let reviewSummary = null;
      if (profile >= PROFILE.USER) {
        const hist = data.getReviews(row.taskId);
        if (hist.length) {
          const last = hist[hist.length - 1];
          reviewSummary = {
            state: row.reviewState || 'none',
            version: row.linkVersion || 0,
            iteration: Number(row.reviewIteration) || 0,
            lastAction: last.action,
            lastNotes: last.notes || '',
            lastAt: last.at,
            showOnDetail: String(row.reviewState || '') !== 'approved',
            history:
              profile >= PROFILE.USER
                ? hist.map((h) => ({
                    version: h.version,
                    notes: h.notes,
                    byUsername: h.byUsername,
                    at: h.at,
                    action: h.action,
                    linkAtReview: h.linkAtReview || '',
                  }))
                : undefined,
          };
        } else {
          reviewSummary = {
            state: row.reviewState || 'none',
            version: row.linkVersion || 0,
            iteration: Number(row.reviewIteration) || 0,
            showOnDetail: (row.reviewState || 'none') !== 'approved',
          };
        }
      }

      return {
        task: toPublicTask(row, nameMap, {
          profile,
          stages,
          reviewSummary,
          refSecret: data.refSecret,
        }),
      };
    },
  };
}

module.exports = { createGetTask };
