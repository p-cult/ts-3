'use strict';

/**
 * HTTP adapter — auth (thin).
 */

function register(router) {
  router.post('/api/login', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.login.execute(body);
    // Optional cookie for same-origin browser
    const cookie =
      `ts3_session=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`;
    ctx.sendJson(200, result, { 'Set-Cookie': cookie });
  });

  router.post('/api/logout', async (ctx) => {
    const token = ctx.actor && ctx.actor.token;
    await ctx.useCases.logout.execute({ token });
    ctx.sendJson(
      200,
      { ok: true },
      {
        'Set-Cookie':
          'ts3_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      }
    );
  });

  router.get('/api/me', async (ctx) => {
    const result = await ctx.useCases.getMe.execute({ actor: ctx.actor });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
