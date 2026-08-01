'use strict';

const { ALL_STATUSES } = require('../domain/roles');

/**
 * Dropdown vocabulary for forms — people, projects, statuses.
 * Status list is a hard-coded fallback matching server PATCH gates.
 */
function createGetDropdownData({ data }) {
  return {
    async execute() {
      const people = data.listUsers().map((u) => ({
        username: u.username,
        displayName: u.displayName || u.username,
      }));
      const projects = data.listProjects().map((p) => ({
        code: p.code,
        name: p.name || p.code,
      }));
      return {
        people,
        projects,
        statuses: ALL_STATUSES.slice(),
      };
    },
  };
}

module.exports = { createGetDropdownData };
