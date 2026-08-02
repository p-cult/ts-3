'use strict';

const { PROFILE, normalizeProfile } = require('../domain/roles');
const { unauthorized, forbidden, badRequest } = require('../errors');

/**
 * P4: re-hydrate mirror from live Apps Script bridge (depot / users / projects).
 * Does not mint or write sheets — read-only pull.
 */
function createRefreshBridge({ data }) {
  return {
    async execute({ actor }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (normalizeProfile(actor.profile) < PROFILE.SUPER_ADMIN) {
        throw forbidden('only admin (P4) can refresh from master');
      }
      if (!data || typeof data.refreshFromBridge !== 'function') {
        throw badRequest('bridge refresh not available on this store');
      }
      const result = await data.refreshFromBridge();
      if (!result || !result.ok) {
        return {
          ok: false,
          reason: (result && (result.reason || result.message)) || 'bridge refresh failed',
          liveBridge: !!(data.useLiveBridge),
        };
      }
      return {
        ok: true,
        liveBridge: true,
        rows: result.rows,
        skipped: result.skipped,
        users: result.users,
        projects: result.projects,
        projectList: data.listProjects().map((p) => ({
          code: p.code,
          name: p.name,
          label: p.label || p.name,
          pseudoName: p.pseudoName || '',
        })),
      };
    },
  };
}

module.exports = { createRefreshBridge };
