'use strict';

/**
 * Composition root — wires circles once + runs bootstrap self-heal.
 * Dependencies point inward. domain never imports this file.
 */

const { config: defaultConfig } = require('./config');
const { log } = require('./log');
const { createDataAccess } = require('./data');
const { createUseCases } = require('./use-cases');
const { buildHttpRouter } = require('./adapters');
const { createRuntimeState } = require('./runtime/state');
const { bootstrap } = require('./runtime/bootstrap');

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
  const useCases = createUseCases({ config, data, runtime, log: appLog });
  const router = buildHttpRouter({ config, useCases, data, log: appLog });

  runtime.markStarted();

  return {
    config,
    log: appLog,
    data,
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
