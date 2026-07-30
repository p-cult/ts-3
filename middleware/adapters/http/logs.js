'use strict';

function register(router) {
  router.get('/api/logs', async (ctx) => {
    const result = await ctx.useCases.listLogs.execute({
      actor: ctx.actor,
      query: ctx.query,
    });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
