'use strict';

/**
 * Single data-access door (outer infrastructure).
 * No business rules. Routes never call bridge URLs directly.
 */

const { createMemoryData } = require('./memory');
const { withRetry, isRetryable } = require('./retry');
const { notImplemented } = require('../errors');

/**
 * @param {{ config: object, log?: object }} deps
 */
function createDataAccess(deps) {
  const config = deps.config;
  const log = deps.log;

  const adapterName = String(config.storeAdapter || 'memory').toLowerCase();
  const inner = createMemoryData();

  // If someone bypassed bootstrap with a bad adapter name, stay honest
  if (adapterName !== 'memory' && adapterName !== inner.kind) {
    log && log.warn && log.warn('data adapter mismatch', {
      requested: adapterName,
      active: inner.kind,
    });
  }

  const api = {
    kind: inner.kind,
    withRetry: (fn, opts) => withRetry(fn, { log, ...opts }),
    isRetryable,

    async ping() {
      return inner.ping();
    },

    /**
     * Self-awareness: bridge dependency without throwing when disabled.
     */
    async bridgeStatus() {
      if (!config.useLiveBridge) {
        return {
          ok: true,
          state: 'disabled',
          message: 'USE_LIVE_BRIDGE=false',
        };
      }
      if (!config.bridgeUrl || !config.bridgeSecret) {
        return {
          ok: false,
          state: 'misconfigured',
          message: 'live bridge on but BRIDGE_URL/BRIDGE_SECRET incomplete',
          hint: 'Set env vars or disable USE_LIVE_BRIDGE',
        };
      }
      // Adapter not implemented yet — report clearly (not a silent ok)
      return {
        ok: false,
        state: 'unavailable',
        message: 'sheets/bridge adapter not installed yet',
        hint: 'Keep USE_LIVE_BRIDGE=false until the Google wave',
      };
    },

    async bridge(_action, _payload) {
      if (!config.useLiveBridge) {
        throw notImplemented('live bridge is disabled (USE_LIVE_BRIDGE=false)');
      }
      throw notImplemented('sheets/bridge adapter not installed yet');
    },

    _unsafeMemory() {
      return inner._state;
    },
  };

  return api;
}

module.exports = {
  createDataAccess,
  withRetry,
  isRetryable,
};
