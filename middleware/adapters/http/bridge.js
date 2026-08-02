'use strict';

function register(router, _deps) {
  router.post('/api/bridge/refresh', async (ctx) => {
    ctx.res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const result = await ctx.useCases.refreshBridge.execute({ actor: ctx.actor });
    ctx.res.statusCode = result.ok ? 200 : 503;
    ctx.res.end(JSON.stringify(result));
  });
}

module.exports = { register };
