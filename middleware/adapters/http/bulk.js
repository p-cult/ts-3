'use strict';

function register(router) {
  router.post('/api/tasks/bulk', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.bulkTasks.execute({
      actor: ctx.actor,
      body,
    });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
