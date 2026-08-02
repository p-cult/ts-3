'use strict';

const crypto = require('crypto');
const { unauthorized } = require('../errors');
const { permissionsFor, roleCode } = require('../domain/roles');

/** Constant-time string compare (length mismatch still returns false safely). */
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) {
    const pad = Buffer.alloc(Math.max(aa.length, 1));
    crypto.timingSafeEqual(pad, pad);
    return false;
  }
  if (aa.length === 0) return false;
  return crypto.timingSafeEqual(aa, bb);
}

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
      if (!user || !safeEqual(user.password, password)) {
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

module.exports = { createLogin, safeEqual };
