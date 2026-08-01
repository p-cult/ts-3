'use strict';

/**
 * HTTP process entry — outermost detail.
 * Attaches actor from session; CSRF on cookie-authenticated writes.
 */

const http = require('http');
const { config: defaultConfig } = require('./config');
const { log, setLevel } = require('./log');
const { sendError, AppError, notFound, forbidden } = require('./errors');
const { parseRequestUrl, requestId } = require('./http');
const { tryServeStatic } = require('./static');
const { createContext } = require('./context');
const { createApp } = require('./app');
const {
  sessionTokenFromRequest,
  csrfFromRequest,
  readBearer,
} = require('./auth/sessions');
const { permissionsFor, roleCode } = require('./domain/roles');
const { PROFILE } = require('./domain/profiles');

function attachActor(ctx, app) {
  const token = sessionTokenFromRequest(ctx.req);
  const session = token && app.sessions ? app.sessions.get(token) : null;
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

  // Bearer-only clients are CSRF-safe
  if (readBearer(ctx.req)) return;

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
        const matched = router.match(req.method, pathname);
        if (!matched) throw notFound(`No route ${req.method} ${pathname}`);
        ctx.params = matched.params;
        assertCsrfIfNeeded(ctx);
        await matched.handler(ctx);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        tryServeStatic(res, config.frontendDir, pathname);
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
  console.log('  ts-3 slice 06 (staging)');
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
  const server = http.createServer(createRequestListener({ app, config }));

  return new Promise((resolve, reject) => {
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
      });
      if (require.main === module || overrides.banner) {
        printStartupBanner(app, addr);
      }
      server.app = app;
      resolve(server);
    });
  });
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
