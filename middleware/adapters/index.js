'use strict';

/**
 * adapters/ — all outer delivery mechanisms.
 * Today: HTTP. Later: maybe CLI or workers — still outer.
 */

const http = require('./http');

module.exports = {
  buildHttpRouter: http.buildRouter,
  buildRouter: http.buildRouter,
};
