'use strict';

const { unauthorized } = require('../errors');

function createListUsers({ data }) {
  return {
    async execute({ actor }) {
      if (!actor || !actor.authenticated) {
        throw unauthorized('sign in to list users');
      }
      return {
        users: data.listUsers().map((u) => ({
          username: u.username,
          displayName: u.displayName || u.username,
        })),
      };
    },
  };
}

module.exports = { createListUsers };
