'use strict';

/**
 * Compatibility shim — HTTP routes live in adapters/http.
 */

const { buildHttpRouter } = require('./adapters');

function buildRoutes(config) {
  return buildHttpRouter({ config });
}

module.exports = { buildRoutes, buildRouter: buildHttpRouter };
