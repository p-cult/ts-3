'use strict';

/**
 * Process-local runtime awareness state (outer detail).
 * Bootstrap records heals/blockers; GetHealth reads them.
 * Not a database — resets on process restart (correct for foundation).
 */

function createRuntimeState() {
  const heals = [];
  const blockers = [];
  const notices = [];
  let startedAt = null;
  let bootstrapOk = false;

  return {
    markStarted() {
      startedAt = new Date().toISOString();
    },
    recordHeal(action) {
      heals.push({
        at: new Date().toISOString(),
        action: String(action.action || action),
        detail: action.detail || undefined,
      });
    },
    recordBlocker(message, hint) {
      blockers.push({
        message: String(message),
        hint: hint ? String(hint) : undefined,
      });
    },
    recordNotice(message) {
      notices.push(String(message));
    },
    setBootstrapOk(v) {
      bootstrapOk = !!v;
    },
    snapshot() {
      return {
        startedAt,
        bootstrapOk,
        heals: heals.slice(),
        blockers: blockers.slice(),
        notices: notices.slice(),
      };
    },
  };
}

module.exports = { createRuntimeState };
