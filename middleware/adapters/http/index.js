'use strict';

const { createRouter } = require('../../router');
const health = require('./health');
const system = require('./system');
const auth = require('./auth');
const bulk = require('./bulk');
const tasks = require('./tasks');
const projects = require('./projects');
const users = require('./users');
const logs = require('./logs');

function buildRouter(_deps) {
  const router = createRouter();

  health.register(router, _deps);
  system.register(router, _deps);
  auth.register(router, _deps);
  bulk.register(router, _deps); // before /api/tasks/:id
  tasks.register(router, _deps);
  projects.register(router, _deps);
  users.register(router, _deps);
  logs.register(router, _deps);

  return router;
}

module.exports = { buildRouter };
