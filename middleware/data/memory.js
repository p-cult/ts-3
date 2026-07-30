'use strict';

/**
 * Memory data adapter — foundation stub.
 * Shape mirrors future Sheets adapter so domain/services do not care which is live.
 *
 * Partitions (empty until product slices fill them):
 *   vehicle  — per-user task homes
 *   depot    — aggregate / master view
 *   mapping  — taskId ↔ locations
 *   meta     — health / version
 */

function createMemoryData(opts = {}) {
  const state = {
    vehicle: Object.create(null), // userSheet -> rows[]
    depot: [],
    mapping: Object.create(null), // taskId -> record
    meta: {
      kind: 'memory',
      startedAt: new Date().toISOString(),
    },
  };

  if (opts.seed && typeof opts.seed === 'object') {
    // Reserved for Slice 01 — foundation stays empty
  }

  return {
    kind: 'memory',

    async ping() {
      return {
        ok: true,
        kind: 'memory',
        depotCount: state.depot.length,
        startedAt: state.meta.startedAt,
      };
    },

    /** Escape hatch for tests / later seed — not for route handlers. */
    _state: state,
  };
}

module.exports = { createMemoryData };
