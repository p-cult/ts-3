'use strict';

function register(router) {
  router.get('/api/reports/journey', async (ctx) => {
    const ref = ctx.query && ctx.query.ref;
    const result = await ctx.useCases.getJourneyReport.execute({
      actor: ctx.actor,
      ref,
    });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
