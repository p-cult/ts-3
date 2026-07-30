'use strict';

/**
 * domain/awareness.js — pure evaluation of system facts into health status.
 * No I/O. No HTTP. Callers gather facts; this decides labels.
 */

const LEVEL = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
});

/**
 * @param {{
 *   configIssues?: Array<{ severity?: string }>,
 *   dependencyOk?: boolean,
 *   blockers?: string[],
 *   healedCount?: number,
 * }} facts
 * @returns {{ status: string, ok: boolean }}
 */
function evaluateOverall(facts) {
  const blockers = facts.blockers || [];
  if (blockers.length > 0) {
    return { status: LEVEL.UNHEALTHY, ok: false };
  }
  if (facts.dependencyOk === false) {
    return { status: LEVEL.UNHEALTHY, ok: false };
  }
  const issues = facts.configIssues || [];
  const hasError = issues.some((i) => i.severity === 'error');
  if (hasError) {
    return { status: LEVEL.UNHEALTHY, ok: false };
  }
  const hasWarn = issues.some((i) => i.severity === 'warn');
  if (hasWarn || (facts.healedCount || 0) > 0) {
    return { status: LEVEL.DEGRADED, ok: true };
  }
  return { status: LEVEL.HEALTHY, ok: true };
}

/**
 * Summarize config fact list into ok + messages (pure).
 * @param {Array<{ code: string, severity: string, message: string, hint?: string }>} issues
 */
function summarizeConfig(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const errors = list.filter((i) => i.severity === 'error');
  return {
    ok: errors.length === 0,
    issueCount: list.length,
    errorCount: errors.length,
    issues: list,
  };
}

module.exports = {
  LEVEL,
  evaluateOverall,
  summarizeConfig,
};
