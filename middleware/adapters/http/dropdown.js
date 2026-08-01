'use strict';

function register(router) {
  router.get('/api/dropdown-data', async (ctx) => {
    const result = await ctx.useCases.getDropdownData.execute();
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
