'use strict';

/**
 * HTTP adapter — health / self-awareness.
 * Thin: use-case decides payload; adapter picks status code only.
 */

function register(router) {
  router.get('/api/health', async (ctx) => {
    const body = await ctx.useCases.getHealth.execute();
    const code = body && body.ok === false ? 503 : 200;
    ctx.sendJson(code, body);
  });
}

module.exports = { register };
