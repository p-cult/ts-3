'use strict';

const { PROFILE, normalizeProfile } = require('../domain/roles');
const { unauthorized, forbidden, badRequest } = require('../errors');

/**
 * P4: pull Master admin project vocabulary only (no depot/users hydrate).
 */
function createRefreshProjects({ data }) {
  return {
    async execute({ actor } = {}) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (normalizeProfile(actor.profile) < PROFILE.SUPER_ADMIN) {
        throw forbidden('only admin (P4) can refresh projects from master');
      }
      if (!data || typeof data.refreshProjectsFromBridge !== 'function') {
        throw badRequest('projects refresh not available on this store');
      }
      const result = await data.refreshProjectsFromBridge();
      if (!result || !result.ok) {
        return {
          ok: false,
          reason: (result && (result.reason || result.message)) || 'projects refresh failed',
          liveBridge: !!(data.useLiveBridge),
        };
      }
      return {
        ok: true,
        liveBridge: !!(data.useLiveBridge),
        projects: result.projects,
        changed: !!result.changed,
        replaced: !!result.replaced,
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

module.exports = { createRefreshProjects };
