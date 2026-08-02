'use strict';

const { unauthorized } = require('../errors');

function createListProjects({ data }) {
  return {
    async execute({ actor }) {
      if (!actor || !actor.authenticated) {
        throw unauthorized('sign in to list projects');
      }
      return {
        projects: data.listProjects().map((p) => ({
          code: p.code,
          name: p.name,
          label: p.label || p.name,
          pseudoName: p.pseudoName || '',
        })),
      };
    },
  };
}

module.exports = { createListProjects };
