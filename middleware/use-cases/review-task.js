'use strict';

const {
  canSubmitReview,
  canModerateReview,
  normalizeReviewState,
  nextIteration,
  normalizeRatings,
} = require('../domain/review');
const { isReviewable } = require('../domain/kinds');
const { canViewTask } = require('../domain/tasks');
const {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
} = require('../errors');

function loadTask(data, id, actor) {
  const row = data.findByRef(id);
  if (!row) throw notFound('task not found');
  const view = canViewTask(row, actor);
  if (view === 'not_found') throw notFound('task not found');
  if (view === 'forbidden') throw forbidden('not allowed');
  if (!isReviewable(row.kind)) {
    throw badRequest('review only for main or sub tasks');
  }
  return row;
}

function append(data, row, entry) {
  data.appendReview(row.taskId, entry);
}

function createReviewTask({ data }) {
  return {
    /**
     * Submit / resubmit for review.
     * body: { ratings?: [{url, stars, tag?, comment?}, ...], link?, notes? }
     */
    async submit({ actor, id, ratings, link, notes }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (!canSubmitReview(actor.profile)) throw forbidden('cannot submit review');
      const row = loadTask(data, id, actor);
      const owns = row.assigneeUsername === actor.username;
      if (actor.profile < 4 && !owns) {
        throw forbidden('only owner can submit for review');
      }

      let nextLink = String(row.link || '').trim();
      const incoming = link != null ? String(link).trim() : '';
      if (incoming) nextLink = incoming;
      if (Array.isArray(ratings) && ratings.length > 4) {
        throw badRequest('maximum 4 links allowed');
      }
      const normRatings = normalizeRatings(ratings);
      if (normRatings.length && !nextLink) {
        nextLink = normRatings[0].url;
      }
      if (!nextLink) {
        throw badRequest('link is required to submit for review');
      }

      const at = new Date().toISOString();
      let linkVersion = Number(row.linkVersion) || 0;
      if (incoming && incoming !== String(row.link || '').trim()) {
        linkVersion = (linkVersion || 0) + 1;
      } else if (!linkVersion && nextLink) {
        linkVersion = 1;
      }

      append(data, row, {
        version: linkVersion,
        linkAtReview: nextLink,
        notes: String(notes || '').trim(),
        ratings: normRatings,
        byUsername: actor.username,
        at,
        action: 'submit',
        iteration: Number(row.reviewIteration) || 0,
      });

      const updated = data.updateByRef(id, {
        link: nextLink,
        linkVersion,
        reviewState: 'under_review',
        updatedAt: at,
      });
      return {
        ok: true,
        reviewState: updated.reviewState,
        reviewIteration: updated.reviewIteration || 0,
        linkVersion: updated.linkVersion || 0,
      };
    },

    async feedback({ actor, id, notes, ratings }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (!canModerateReview(actor.profile)) {
        throw forbidden('only moderator or admin can add feedback');
      }
      const row = loadTask(data, id, actor);
      const text = String(notes || '').trim();
      if (!text) throw badRequest('notes required');
      const at = new Date().toISOString();
      const normRatings = normalizeRatings(ratings);
      append(data, row, {
        version: row.linkVersion || 0,
        linkAtReview: row.link || '',
        notes: text,
        ratings: normRatings,
        byUsername: actor.username,
        at,
        action: 'feedback',
        iteration: Number(row.reviewIteration) || 0,
      });
      return {
        ok: true,
        reviewState: normalizeReviewState(row.reviewState),
        reviewIteration: row.reviewIteration || 0,
      };
    },

    /** Preferred name for re-work */
    async rework({ actor, id, notes, ratings }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (!canModerateReview(actor.profile)) {
        throw forbidden('only moderator or admin can request re-work');
      }
      const row = loadTask(data, id, actor);
      const text = String(notes || '').trim();
      if (!text) throw badRequest('notes are required for re-work');
      const at = new Date().toISOString();
      const iteration = nextIteration(row.reviewIteration);
      const normRatings = normalizeRatings(ratings);
      append(data, row, {
        version: row.linkVersion || 0,
        linkAtReview: row.link || '',
        notes: text,
        ratings: normRatings,
        byUsername: actor.username,
        at,
        action: 'rework',
        iteration,
      });
      const updated = data.updateByRef(id, {
        reviewState: 'rework',
        reviewIteration: iteration,
        updatedAt: at,
      });
      return {
        ok: true,
        reviewState: updated.reviewState,
        reviewIteration: updated.reviewIteration,
      };
    },

    async approve({ actor, id, notes, ratings }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (!canModerateReview(actor.profile)) {
        throw forbidden('only moderator or admin can approve');
      }
      const row = loadTask(data, id, actor);
      const at = new Date().toISOString();
      const normRatings = normalizeRatings(ratings);
      // freeze final ratings on approve
      append(data, row, {
        version: row.linkVersion || 0,
        linkAtReview: row.link || '',
        notes: String(notes || '').trim(),
        ratings: normRatings.length ? normRatings : undefined,
        byUsername: actor.username,
        at,
        action: 'approve',
        iteration: Number(row.reviewIteration) || 0,
      });
      const updated = data.updateByRef(id, {
        reviewState: 'approved',
        updatedAt: at,
      });
      return {
        ok: true,
        reviewState: updated.reviewState,
        reviewIteration: updated.reviewIteration || 0,
      };
    },
  };
}

module.exports = { createReviewTask };
