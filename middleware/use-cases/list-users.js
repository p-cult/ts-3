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
          profile: Number(u.profile) || 0,
          userSheet: u.userSheet || '',
          status: u.status || '',
        })),
      };
    },
  };
}

module.exports = { createListUsers };
