'use strict';

/**
 * Composition root — wires circles once + bootstrap self-heal.
 */

const { config: defaultConfig } = require('./config');
const { log } = require('./log');
const { createDataAccess } = require('./data');
const { createUseCases } = require('./use-cases');
const { buildHttpRouter } = require('./adapters');
const { createRuntimeState } = require('./runtime/state');
const { bootstrap } = require('./runtime/bootstrap');
const { createSessionStore } = require('./auth/sessions');

/**
 * @param {{ config?: object, log?: object, skipBootstrap?: boolean }} [overrides]
 */
function createApp(overrides = {}) {
  const appLog = overrides.log || log;
  const runtime = createRuntimeState();

  let config = overrides.config || defaultConfig;
  let boot = {
    ready: true,
    issues: [],
    heals: [],
    config,
  };

  if (!overrides.skipBootstrap) {
    boot = bootstrap({ config, log: appLog, runtime });
    config = boot.config;
  } else {
    runtime.setBootstrapOk(true);
  }

  const data = createDataAccess({ config, log: appLog });
  const sessions = createSessionStore({
    // Must be stable across Render restarts — never empty in prod (bootstrap enforces).
    secret:
      config.sessionSecret
      || process.env.SESSION_SECRET
      || 'dev-ref-secret',
  });
  const useCases = createUseCases({
    config,
    data,
    runtime,
    sessions,
    log: appLog,
  });
  const router = buildHttpRouter({
    config,
    useCases,
    data,
    sessions,
    log: appLog,
  });

  runtime.markStarted();

  if (typeof data.startSheetsWorker === 'function') {
    data.startSheetsWorker();
  }

  return {
    config,
    log: appLog,
    data,
    sessions,
    useCases,
    services: useCases,
    router,
    runtime,
    bootstrap: {
      ready: boot.ready,
      issues: boot.issues,
      heals: boot.heals,
    },
  };
}

module.exports = { createApp };
