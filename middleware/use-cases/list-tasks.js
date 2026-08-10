'use strict';

const { scopeTasks, toPublicTask, nestHierarchy } = require('../domain/tasks');
const { PROFILE, normalizeProfile } = require('../domain/profiles');
const { normalizeReviewState } = require('../domain/review');
const { isLoggedKind, countsAsCompleted } = require('../domain/classifier');
const { isFinishedStatus } = require('../domain/status');
const { forbidden } = require('../errors');
const { applyAll } = require('../priority');

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
        // Public (P1) may browse Done work; logged/needs stay signed-in only.
        scoped = scoped.filter((t) => countsAsCompleted(t));
      } else if (board === 'logged') {
        if (profile < PROFILE.USER) {
          throw forbidden('logged tab requires sign-in');
        }
        // Open diary rows only — Done/Approved live on Completed, never Logged.
        scoped = scoped.filter(
          (t) => isLoggedKind(t.kind) && !isFinishedStatus(t.status)
        );
      } else if (board === 'active') {
        // Same silhouette as UI Board: open work only (not Done), no diary rows.
        // Keep file-approved Active tasks visible (matches client filterTasksForView).
        scoped = scoped.filter((t) => !isFinishedStatus(t.status));
        scoped = scoped.filter((t) => !isLoggedKind(t.kind));
      }

      if (reviewFilter) {
        scoped = scoped.filter(
          (t) => normalizeReviewState(t.reviewState) === reviewFilter
        );
      }

      const wantReview = profile >= PROFILE.USER;
      const peekLast =
        typeof data.peekLastReview === 'function'
          ? (id) => data.peekLastReview(id)
          : (id) => {
              const hist = data.getReviews(id);
              return hist.length ? hist[hist.length - 1] : null;
            };

      const tasks = scoped.map((t) => {
        const stages = data.getStages(t.taskId);
        let reviewSummary = null;
        if (wantReview) {
          const state = normalizeReviewState(t.reviewState);
          const last = peekLast(t.taskId);
          if (last || (state && state !== 'none')) {
            reviewSummary = {
              state,
              version: t.linkVersion || 0,
              iteration: Number(t.reviewIteration) || 0,
              lastAction: last ? last.action : '',
              lastNotes: last ? last.notes || '' : '',
              lastRatings: last ? last.ratings : undefined,
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

      applyAll(tasks);

      if (nested) {
        return { tasks, hierarchy: nestHierarchy(tasks) };
      }
      return { tasks };
    },
  };
}

module.exports = { createListTasks };
