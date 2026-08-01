'use strict';

function register(router) {
  router.get('/api/users', async (ctx) => {
    const result = await ctx.useCases.listUsers.execute({ actor: ctx.actor });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
