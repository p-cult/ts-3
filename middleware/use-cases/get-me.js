'use strict';

const { PROFILE, roleCode, permissionsFor } = require('../domain/roles');

function createGetMe() {
  return {
    /**
     * @param {{ actor: object }} input
     */
    async execute(input) {
      const actor = (input && input.actor) || {};
      if (!actor.authenticated) {
        return {
          user: null,
          role: 'P1',
          profile: PROFILE.PUBLIC,
          permissions: permissionsFor(PROFILE.PUBLIC),
        };
      }
      return {
        user: {
          username: actor.username,
          displayName: actor.displayName,
          role: actor.role || roleCode(actor.profile),
          profile: actor.profile,
          userSheet: actor.userSheet,
        },
        // Heal browser localStorage when HttpOnly cookie authenticated the request
        // but Bearer in localStorage was missing/stale after a server restart.
        token: actor.token || undefined,
        csrfToken: actor.csrfToken || undefined,
        role: actor.role || roleCode(actor.profile),
        profile: actor.profile,
        permissions: actor.permissions || permissionsFor(actor.profile),
      };
    },
  };
}

module.exports = { createGetMe };
