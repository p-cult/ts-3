'use strict';

const { unauthorized } = require('../errors');
const { permissionsFor, roleCode } = require('../domain/roles');

function createLogin({ data, sessions }) {
  return {
    /**
     * @param {{ username: string, password: string }} input
     */
    async execute(input) {
      const username = String((input && input.username) || '').trim();
      const password = String((input && input.password) || '');
      if (!username || !password) {
        throw unauthorized('username and password required');
      }
      const user = data.findUser(username);
      if (!user || user.password !== password) {
        throw unauthorized('invalid username or password');
      }
      const out = sessions.create(user);
      const perms = permissionsFor(user.profile);
      return {
        user: {
          username: user.username,
          displayName: user.displayName,
          role: roleCode(user.profile),
          profile: user.profile,
          userSheet: user.userSheet,
        },
        permissions: perms,
        token: out.token,
        csrfToken: out.csrfToken,
      };
    },
  };
}

module.exports = { createLogin };
