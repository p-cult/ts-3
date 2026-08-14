'use strict';

/**
 * HTTP adapter — auth (thin).
 * Login issues a signed Bearer token (body + optional cookie + X-Session-Token).
 */

const { SESSION_TTL_MS } = require('../../auth/sessions');

function sessionCookie(token, { clear, secure, crossSite } = {}) {
  const maxAge = clear ? 0 : Math.floor(SESSION_TTL_MS / 1000);
  const value = clear ? '' : encodeURIComponent(token || '');
  // Pages (p-cult.github.io) → Render is cross-site; Lax cookies never stick.
  const sameSite = crossSite ? 'None' : 'Lax';
  let c =
    'ts3_session=' + value
    + '; Path=/; HttpOnly; SameSite=' + sameSite + '; Max-Age=' + maxAge;
  // SameSite=None requires Secure; prod always Secure.
  if (secure || crossSite) c += '; Secure';
  return c;
}

function register(router) {
  router.post('/api/login', async (ctx) => {
    const body = await ctx.readJson();
    const result = await ctx.useCases.login.execute(body);
    const secure = !!(ctx.config && ctx.config.isProd);
    const crossSite = !!(ctx.config && ctx.config.corsOrigin);
    ctx.sendJson(200, result, {
      'Set-Cookie': sessionCookie(result.token, { secure, crossSite }),
      // Pages bake shim + debugging — same value as JSON body.token
      'X-Session-Token': result.token,
    });
  });

  router.post('/api/logout', async (ctx) => {
    const token = ctx.actor && ctx.actor.token;
    await ctx.useCases.logout.execute({ token });
    const secure = !!(ctx.config && ctx.config.isProd);
    const crossSite = !!(ctx.config && ctx.config.corsOrigin);
    ctx.sendJson(
      200,
      { ok: true },
      {
        'Set-Cookie': sessionCookie('', { clear: true, secure, crossSite }),
      }
    );
  });

  router.get('/api/me', async (ctx) => {
    const result = await ctx.useCases.getMe.execute({ actor: ctx.actor });
    ctx.sendJson(200, result);
  });
}

module.exports = { register };
