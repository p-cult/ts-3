'use strict';

/**
 * HTTP adapter — system discovery.
 * No business decisions.
 */

function register(router) {
  router.get('/api', async (ctx) => {
    const authed = !!(ctx.actor && ctx.actor.authenticated);
    ctx.sendJson(200, {
      ok: true,
      message: 'ts-3 API foundation',
      foundation: true,
      // Full route inventory only when signed in (cuts anonymous recon surface).
      routes: authed ? router.list() : ['GET /api/health', 'POST /api/login', 'GET /api/me'],
      actor: {
        role: ctx.actor.role,
        authenticated: ctx.actor.authenticated,
      },
    });
  });
}

module.exports = { register };
