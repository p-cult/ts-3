'use strict';

function register(router) {
  router.get('/api/dropdown-data', async (ctx) => {
    const result = await ctx.useCases.getDropdownData.execute({ actor: ctx.actor });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
