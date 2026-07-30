'use strict';

function register(router) {
  router.get('/api/projects', async (ctx) => {
    const result = await ctx.useCases.listProjects.execute({ actor: ctx.actor });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
