'use strict';

const { ALL_STATUSES } = require('../domain/roles');

/**
 * Dropdown vocabulary for forms — people, projects, statuses.
 * Status list is a hard-coded fallback matching server PATCH gates.
 */
function createGetDropdownData({ data }) {
  return {
    async execute({ actor } = {}) {
      const projects = data.listProjects().map((p) => ({
        code: p.code,
        name: p.name || p.code,
        label: p.label || p.name || p.code,
        pseudoName: p.pseudoName || '',
      }));
      const statuses = ALL_STATUSES.slice();
      // People list is account inventory — only for signed-in callers.
      if (!actor || !actor.authenticated) {
        return { people: [], projects, statuses };
      }
      const people = data.listUsers().map((u) => ({
        username: u.username,
        displayName: u.displayName || u.username,
      }));
      return { people, projects, statuses };
    },
  };
}

module.exports = { createGetDropdownData };
