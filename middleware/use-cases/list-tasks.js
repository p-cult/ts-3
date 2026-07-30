'use strict';

const { scopeTasks, toPublicTask, nestHierarchy } = require('../domain/tasks');
const { PROFILE, normalizeProfile } = require('../domain/profiles');
const { normalizeReviewState } = require('../domain/review');
const { forbidden } = require('../errors');

function createListTasks({ data }) {
  return {
    /**
     * query: nested, reviewState, board=active|needs_review|completed
     */
    async execute({ actor, nested, query }) {
      const profile = normalizeProfile(actor && actor.profile);
      const q = query || {};
      const depot = data.listDepot();
      let scoped = scopeTasks(depot, actor || { profile: 1 });
      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );

      const board = String(q.board || '').toLowerCase();
      let reviewFilter = q.reviewState
        ? normalizeReviewState(q.reviewState)
        : '';

      if (board === 'needs_review') {
        if (profile < PROFILE.MODERATOR) {
          throw forbidden('needs review is for moderators and admins');
        }
        reviewFilter = 'under_review';
      } else if (board === 'completed') {
        reviewFilter = 'approved';
      } else if (board === 'active') {
        // main board: hide approved (still in completed tab)
        scoped = scoped.filter(
          (t) => normalizeReviewState(t.reviewState) !== 'approved'
        );
      }

      if (reviewFilter) {
        scoped = scoped.filter(
          (t) => normalizeReviewState(t.reviewState) === reviewFilter
        );
      }

      const tasks = scoped.map((t) => {
        const stages = data.getStages(t.taskId);
        const hist = data.getReviews(t.taskId);
        let reviewSummary = null;
        if (profile >= PROFILE.USER) {
          const state = normalizeReviewState(t.reviewState);
          if (hist.length || (state && state !== 'none')) {
            const last = hist.length ? hist[hist.length - 1] : null;
            reviewSummary = {
              state,
              version: t.linkVersion || 0,
              iteration: Number(t.reviewIteration) || 0,
              lastAction: last ? last.action : '',
              lastNotes: last ? last.notes || '' : '',
              lastAt: last ? last.at : '',
              showOnDetail: state !== 'approved',
            };
          }
        }
        return toPublicTask(t, nameMap, {
          profile,
          stages,
          reviewSummary,
          refSecret: data.refSecret,
        });
      });

      if (nested) {
        return { tasks, hierarchy: nestHierarchy(tasks) };
      }
      return { tasks };
    },
  };
}

module.exports = { createListTasks };
