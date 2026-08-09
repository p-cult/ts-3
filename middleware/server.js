'use strict';

/**
 * HTTP process entry — outermost detail.
 * Attaches actor from session; CSRF on cookie-authenticated writes.
 */

const http = require('http');
const path = require('path');
const { config: defaultConfig } = require('./config');
const { log, setLevel } = require('./log');
const { sendError, AppError, notFound, forbidden, CODE } = require('./errors');
const { parseRequestUrl, requestId } = require('./http');
const { tryServeStatic } = require('./static');
const { createContext } = require('./context');
const { createApp } = require('./app');
const {
  sessionTokenFromRequest,
  csrfFromRequest,
  readBearer,
  readCookie,
} = require('./auth/sessions');
const { permissionsFor, roleCode } = require('./domain/roles');
const { PROFILE } = require('./domain/profiles');
const { createRateLimiter, clientIp } = require('./http/rate-limit');

function applyCors(req, res, config) {
  const origin = config.corsOrigin;
  if (!origin) return;
  const reqOrigin = req.headers.origin;
  if (reqOrigin && reqOrigin !== origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Request-Id'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

function attachActor(ctx, app) {
  const bearer = readBearer(ctx.req);
  const cookieTok = readCookie(ctx.req, 'ts3_session');
  // Prefer a *valid* Bearer; if localStorage is stale after a restart, fall back
  // to the HttpOnly cookie instead of treating the request as anonymous.
  let session = null;
  if (bearer && app.sessions) session = app.sessions.get(bearer);
  if (!session && cookieTok && app.sessions) session = app.sessions.get(cookieTok);
  if (session) {
    const profile = session.profile;
    ctx.setActor(
      {
        authenticated: true,
        profile,
        role: roleCode(profile),
        username: session.username,
        displayName: session.displayName,
        userSheet: session.userSheet,
        employeeId: session.employeeId,
        token: session.token,
        csrfToken: session.csrfToken,
      },
      permissionsFor(profile)
    );
    ctx.session = session;
  } else {
    ctx.setActor(
      {
        authenticated: false,
        profile: PROFILE.PUBLIC,
        role: 'P1',
        username: null,
        displayName: null,
        userSheet: null,
        user: null,
      },
      permissionsFor(PROFILE.PUBLIC)
    );
    ctx.session = null;
  }
}

function assertCsrfIfNeeded(ctx) {
  const method = String(ctx.req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  // login is bootstrap
  if (ctx.pathname === '/api/login') return;

  // Valid Bearer (matches live session) → CSRF-safe. Stale Bearer alone does not skip CSRF.
  const bearer = readBearer(ctx.req);
  if (bearer && ctx.session && ctx.session.token === bearer) return;

  // Anonymous writes: no CSRF cookie yet
  if (!ctx.actor.authenticated) return;

  const expected = ctx.session && ctx.session.csrfToken;
  const got = csrfFromRequest(ctx.req);
  if (!expected || !got || expected !== got) {
    throw forbidden('invalid or missing CSRF token');
  }
}

function createRequestListener(opts = {}) {
  const app = opts.app || createApp({ config: opts.config || defaultConfig });
  const { config, router, useCases, data } = app;
  setLevel(config.logLevel);

  const rate = createRateLimiter({ windowMs: config.rateWindowMs || 60000 });
  const maxLogins = Number(config.rateMaxLogins) || 10;
  const maxWrites = Number(config.rateMaxWrites) || 60;

  return async function onRequest(req, res) {
    const id = requestId(req);
    const started = Date.now();
    res.setHeader('X-Request-Id', id);

    const { pathname, query } = parseRequestUrl(req);
    const reqLog = log.child({ requestId: id });

    const ctx = createContext({
      req,
      res,
      config,
      useCases,
      data,
      log: reqLog,
      requestId: id,
      pathname,
      query,
    });
    ctx.app = app;
    attachActor(ctx, app);

    try {
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        applyCors(req, res, config);
        if (String(req.method || 'GET').toUpperCase() === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          reqLog.info('request', {
            method: req.method,
            path: pathname,
            status: 204,
            ms: Date.now() - started,
            role: ctx.actor && ctx.actor.role,
          });
          return;
        }

        const method = String(req.method || 'GET').toUpperCase();
        const ip = clientIp(req);
        if (pathname === '/api/login' && method === 'POST') {
          if (!rate.underLimit('l:' + ip, maxLogins)) {
            throw new AppError(CODE.RATE_LIMIT, 'too many login attempts, try again shortly');
          }
        } else if (method !== 'GET' && method !== 'HEAD') {
          if (!rate.underLimit('w:' + ip, maxWrites)) {
            throw new AppError(CODE.RATE_LIMIT, 'too many requests, please slow down');
          }
        }

        const matched = router.match(req.method, pathname);
        if (!matched) throw notFound(`No route ${req.method} ${pathname}`);
        ctx.params = matched.params;
        assertCsrfIfNeeded(ctx);
        await matched.handler(ctx);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        if (pathname === '/shared' || pathname.startsWith('/shared/')) {
          const sharedRoot = path.join(__dirname, 'shared');
          const rel = pathname === '/shared' || pathname === '/shared/'
            ? '/index.html'
            : pathname.slice('/shared'.length);
          tryServeStatic(res, sharedRoot, rel);
        } else {
          tryServeStatic(res, config.frontendDir, pathname);
        }
      } else {
        throw notFound(`No route ${req.method} ${pathname}`);
      }

      reqLog.info('request', {
        method: req.method,
        path: pathname,
        status: res.statusCode,
        ms: Date.now() - started,
        role: ctx.actor && ctx.actor.role,
      });
    } catch (err) {
      sendError(res, err, { requestId: id, isDev: config.isDev });
      reqLog.info('request', {
        method: req.method,
        path: pathname,
        status: res.statusCode,
        ms: Date.now() - started,
        err: err instanceof AppError ? err.code : 'error',
        role: ctx.actor && ctx.actor.role,
      });
    }
  };
}

function printStartupBanner(app, addr) {
  const b = app.bootstrap || {};
  const heals = (b.heals || []).length;
  console.log('');
  console.log('  ts-3 slice 15 (staging — production-ready track)');
  console.log(`  url     http://${addr.address}:${addr.port}/`);
  console.log(`  health  http://${addr.address}:${addr.port}/api/health`);
  console.log(`  mode    ${app.config.appMode || 'staging'}`);
  console.log(`  env     ${app.config.env}`);
  console.log(`  store   ${app.data.kind}`);
  if (heals) console.log(`  healed  ${heals} action(s)`);
  console.log('  stop    ctrl+c');
  console.log('');
}

function startServer(overrides = {}) {
  const baseConfig = overrides.config || defaultConfig;
  const app = overrides.app || createApp({ config: baseConfig });

  if (app.bootstrap && app.bootstrap.ready === false) {
    const errors = (app.bootstrap.issues || [])
      .filter((i) => i.severity === 'error')
      .map((i) => `  - ${i.message}${i.hint ? ` (${i.hint})` : ''}`);
    log.error('refusing to start — bootstrap failed', {});
    console.error('\nBootstrap failed:\n' + errors.join('\n') + '\n');
    return Promise.reject(new Error('bootstrap failed'));
  }

  const config = app.config;
  const host = overrides.host || config.host;
  const port = overrides.port !== undefined ? overrides.port : config.port;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function markHydrate(r, extra) {
    if (!app.data || typeof app.data !== 'object') return;
    app.data.hydrateOk = !!(r && r.ok !== false);
    app.data.hydrateAt = new Date().toISOString();
    app.data.hydrateReason = (r && r.reason) || (extra && extra.reason) || null;
    app.data.hydrateFromCache = !!(r && r.fromCache) || !!(extra && extra.fromCache);
  }

  async function tryHydrateOnce() {
    const r = await app.data.refreshFromBridge();
    log.info('live bridge hydrate', r || {});
    markHydrate(r);
    if (r && r.ok !== false) {
      app.data.hydrateFromCache = false;
    }
    return r;
  }

  /**
   * Cold-start / free-tier wake often races Apps Script → former exit(1) alerts.
   * Never block listen on the bridge: seed from disk mirror if present, then
   * refresh in the background until live hydrate succeeds.
   */
  async function hydrateIfNeeded() {
    if (!config.useLiveBridge) return;
    if (!app.data || typeof app.data.refreshFromBridge !== 'function') return;

    if (typeof app.data.loadMirrorCache === 'function') {
      const cached = app.data.loadMirrorCache();
      if (cached && cached.ok) {
        app.data.hydrateOk = false;
        app.data.hydrateAt = new Date().toISOString();
        app.data.hydrateReason = 'booted from mirror-cache; live refresh pending';
        app.data.hydrateFromCache = true;
        log.info('booted from mirror cache', {
          savedAt: cached.savedAt || null,
          rows: cached.rows,
        });
      }
    }

    // Fire-and-forget first live attempt; listen proceeds immediately.
    const bootLive = tryHydrateOnce()
      .then((r) => {
        if (r && r.ok !== false) return r;
        log.warn('boot live hydrate incomplete — keeping mirror/fixture', {
          reason: (r && r.reason) || 'unknown',
        });
        scheduleBackgroundHydrate();
        return r;
      })
      .catch((err) => {
        const reason = String(err && err.message ? err.message : err);
        if (!app.data.hydrateFromCache) {
          markHydrate({ ok: false, reason });
        } else {
          app.data.hydrateReason = 'mirror-cache; live hydrate failed: ' + reason;
        }
        log.warn('boot live hydrate threw — keeping mirror/fixture', { err: reason });
        scheduleBackgroundHydrate();
        return { ok: false, reason };
      });

    // Optionally wait briefly so a healthy bridge wins before first requests.
    const waitMs = Number(process.env.HYDRATE_BOOT_WAIT_MS);
    const budget = Number.isFinite(waitMs) && waitMs >= 0 ? waitMs : 2500;
    if (budget > 0) {
      await Promise.race([bootLive, sleep(budget)]);
    }
  }

  function scheduleBackgroundHydrate() {
    if (app._hydrateRetryTimer) return;
    let delay = 15000;
    const tick = async () => {
      app._hydrateRetryTimer = null;
      if (!app.data || typeof app.data.refreshFromBridge !== 'function') return;
      if (app.data.hydrateOk === true && !app.data.hydrateFromCache) return;
      try {
        const r = await tryHydrateOnce();
        if (r && r.ok !== false) {
          log.info('background hydrate recovered', r || {});
          return;
        }
      } catch (err) {
        log.warn('background hydrate failed', {
          err: String(err && err.message ? err.message : err),
        });
      }
      delay = Math.min(120000, Math.floor(delay * 1.5));
      app._hydrateRetryTimer = setTimeout(tick, delay);
      if (typeof app._hydrateRetryTimer.unref === 'function') {
        app._hydrateRetryTimer.unref();
      }
    };
    app._hydrateRetryTimer = setTimeout(tick, delay);
    if (typeof app._hydrateRetryTimer.unref === 'function') {
      app._hydrateRetryTimer.unref();
    }
  }

  return hydrateIfNeeded().then(
    () =>
      new Promise((resolve, reject) => {
        const server = http.createServer(createRequestListener({ app, config }));
        server.once('error', (err) => {
          if (err && err.code === 'EADDRINUSE') {
            console.error(
              `\nPort ${port} is already in use.\n  Fix: PORT=4304 ./run.sh\n`
            );
          }
          reject(err);
        });
        server.listen(port, host, () => {
          const addr = server.address();
          log.info('server listening', {
            app: config.appName,
            host: addr.address,
            port: addr.port,
            mode: config.appMode,
            store: app.data.kind,
            hydrateOk: app.data.hydrateOk,
            hydrateFromCache: !!app.data.hydrateFromCache,
          });
          if (require.main === module || overrides.banner) {
            printStartupBanner(app, addr);
          }
          server.app = app;
          server.on('close', () => {
            if (app._hydrateRetryTimer) {
              clearTimeout(app._hydrateRetryTimer);
              app._hydrateRetryTimer = null;
            }
            if (app.data && typeof app.data.stopSheetsWorker === 'function') {
              app.data.stopSheetsWorker();
            }
          });
          resolve(server);
        });
      })
  );
}

function createServer(opts) {
  return http.createServer(createRequestListener(opts));
}

if (require.main === module) {
  startServer({ banner: true }).catch((err) => {
    log.error('failed to start', { err: String(err && err.message ? err.message : err) });
    process.exit(1);
  });
}

module.exports = {
  startServer,
  createServer,
  createRequestListener,
  config: defaultConfig,
};
