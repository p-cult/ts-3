'use strict';

function register(router) {
  router.post('/api/inject/preview', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.previewInject.execute({
      actor: ctx.actor,
      body,
    });
    ctx.sendJson(200, result);
  });

  router.post('/api/inject', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.commitInject.execute({
      actor: ctx.actor,
      body,
    });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
