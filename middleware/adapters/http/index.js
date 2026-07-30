'use strict';

/**
 * adapters/http — outer circle: HTTP only.
 *
 * Depends on: use-cases (via ctx), router helper.
 * Must not: mint Task IDs, decide roles, talk to Sheets directly.
 *
 * Add a feature:
 *   1. use-cases/<action>.js
 *   2. adapters/http/<name>.js  register(router)
 *   3. register here
 */

const { createRouter } = require('../../router');
const health = require('./health');
const system = require('./system');

/**
 * @param {object} [_deps]
 */
function buildRouter(_deps) {
  const router = createRouter();

  health.register(router, _deps);
  system.register(router, _deps);

  // Slice 01+: auth.register(router); tasks.register(router);

  return router;
}

module.exports = { buildRouter };
