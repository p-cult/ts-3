'use strict';

/**
 * sheetWriter — vehicle + depot writes of VISIBLE fields only.
 * Refuses invisible (stages / review history) before any store mutation.
 */

const {
  pickVisibleFields,
  refuseInvisibleFields,
} = require('../domain/field-class');
const { badRequest } = require('../errors');

function refuseOrBadRequest(row, context) {
  try {
    refuseInvisibleFields(row, context);
  } catch (e) {
    if (e && e.code === 'INVISIBLE_FIELD') {
      throw badRequest(e.message);
    }
    throw e;
  }
}

/**
 * @param {{ commitBirth: Function, updateByTaskId: Function, updateByRef?: Function }} store
 */
function createSheetWriter(store) {
  return {
    /**
     * Birth into vehicle+depot+mapping — visible core only.
     * @param {object} row
     */
    commitBirth(row) {
      refuseOrBadRequest(row, 'commitBirth');
      return store.commitBirth(pickVisibleFields(row));
    },

    /**
     * Patch vehicle+depot — visible fields only.
     * @param {string} taskId
     * @param {object} patch
     */
    updateByTaskId(taskId, patch) {
      refuseOrBadRequest(patch, 'updateByTaskId');
      return store.updateByTaskId(taskId, pickVisibleFields(patch));
    },

    updateByRef(ref, patch) {
      refuseOrBadRequest(patch, 'updateByRef');
      if (typeof store.updateByRef === 'function') {
        return store.updateByRef(ref, pickVisibleFields(patch));
      }
      return null;
    },
  };
}

module.exports = { createSheetWriter };
