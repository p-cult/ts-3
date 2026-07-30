'use strict';

/**
 * HTTP adapter — system discovery.
 * No business decisions.
 */

function register(router) {
  router.get('/api', async (ctx) => {
    ctx.sendJson(200, {
      ok: true,
      message: 'ts-3 API foundation',
      foundation: true,
      routes: router.list(),
      actor: {
        role: ctx.actor.role,
        authenticated: ctx.actor.authenticated,
      },
    });
  });
}

module.exports = { register };
