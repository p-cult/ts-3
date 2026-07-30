'use strict';

/**
 * HTTP process entry — outermost detail.
 * Bootstrap (self-heal) runs inside createApp before listen.
 */

const http = require('http');
const { config: defaultConfig } = require('./config');
const { log, setLevel } = require('./log');
const { sendError, AppError, notFound } = require('./errors');
const { parseRequestUrl, requestId } = require('./http');
const { tryServeStatic } = require('./static');
const { createContext } = require('./context');
const { createApp } = require('./app');

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

    try {
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        const matched = router.match(req.method, pathname);
        if (!matched) throw notFound(`No route ${req.method} ${pathname}`);
        ctx.params = matched.params;
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
  console.log('  ts-3 foundation');
  console.log(`  url     http://${addr.address}:${addr.port}/`);
  console.log(`  health  http://${addr.address}:${addr.port}/api/health`);
  console.log(`  env     ${app.config.env}`);
  console.log(`  store   ${app.data.kind}`);
  console.log(`  bridge  ${app.config.useLiveBridge ? 'on' : 'off'}`);
  if (heals) console.log(`  healed  ${heals} action(s) — see /api/health`);
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
        log.error('port in use', { port, host });
        console.error(
          `\nPort ${port} is already in use.\n` +
            `  Fix: PORT=4304 ./run.sh\n` +
            `  Or stop the other process on ${port}.\n`
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
        env: config.env,
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
