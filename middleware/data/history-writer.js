'use strict';

/**
 * historyWriter — INVISIBLE fields only (stages detail, review history).
 * Never calls commitBirth / vehicle / depot.
 */

/**
 * @param {{ getStages: Function, setStages: Function, clearStages?: Function,
 *           getReviews: Function, appendReview: Function, clearReviews?: Function }} side
 */
function createHistoryWriter(side) {
  return {
    getStages(taskId) {
      return side.getStages(taskId);
    },

    setStages(taskId, payload) {
      return side.setStages(taskId, payload);
    },

    clearStages(taskId) {
      if (typeof side.clearStages === 'function') side.clearStages(taskId);
    },

    getReviews(taskId) {
      return side.getReviews(taskId);
    },

    peekLastReview(taskId) {
      if (typeof side.peekLastReview === 'function') {
        return side.peekLastReview(taskId);
      }
      const hist = side.getReviews(taskId);
      return hist.length ? hist[hist.length - 1] : null;
    },

    appendReview(taskId, entry) {
      return side.appendReview(taskId, entry);
    },

    clearReviews(taskId) {
      if (typeof side.clearReviews === 'function') side.clearReviews(taskId);
    },

    /**
     * Bundle for reports/logs join.
     * @param {string} taskId
     */
    snapshot(taskId) {
      return {
        stages: side.getStages(taskId),
        reviews: side.getReviews(taskId),
      };
    },
  };
}

module.exports = { createHistoryWriter };
