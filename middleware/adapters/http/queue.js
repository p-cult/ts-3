'use strict';

function register(router) {
  router.get('/api/queue', async (ctx) => {
    const result = await ctx.useCases.listQueue.execute({ actor: ctx.actor });
    ctx.sendJson(200, result);
  });

  router.post('/api/queue/:id/approve', async (ctx) => {
    const result = await ctx.useCases.approveQueue.execute({
      actor: ctx.actor,
      queueId: ctx.params.id,
    });
    ctx.sendJson(200, result);
  });

  router.post('/api/queue/:id/reject', async (ctx) => {
    const body = (await ctx.readJson()) || {};
    const result = await ctx.useCases.rejectQueue.execute({
      actor: ctx.actor,
      queueId: ctx.params.id,
      reason: body.reason,
    });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
