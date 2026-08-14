'use strict';

function register(router) {
  router.get('/api/projects', async (ctx) => {
    const result = await ctx.useCases.listProjects.execute({ actor: ctx.actor });
    ctx.sendJson(200, result);
  });

  router.post('/api/projects/refresh', async (ctx) => {
    const result = await ctx.useCases.refreshProjects.execute({ actor: ctx.actor });
    ctx.sendJson(result.ok ? 200 : 503, result);
  });
}

module.exports = { register };
