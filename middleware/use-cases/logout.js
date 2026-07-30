'use strict';

function createLogout({ sessions }) {
  return {
    async execute({ token }) {
      sessions.destroy(token);
      return { ok: true };
    },
  };
}

module.exports = { createLogout };
