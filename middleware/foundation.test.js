'use strict';

/**
 * Foundation checks — no business features.
 * Run: npm test   or   node middleware/foundation.test.js
 */

const http = require('http');
const assert = require('assert');
const { startServer } = require('./server');
const { createContext, anonymousActor } = require('./context');
const { withRetry, isRetryable } = require('./data/retry');
const { createApp } = require('./app');
const { external, AppError, CODE } = require('./errors');
const { PROFILE, roleCode, normalizeProfile, evaluateOverall, LEVEL } = require('./domain');
const { config: baseConfig } = require('./config');

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ok  — ${name}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`  FAIL — ${name}`);
  console.error('       ', err && err.stack ? err.stack : err);
}

function check(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => ok(name)).catch((e) => fail(name, e));
    }
    ok(name);
    return Promise.resolve();
  } catch (e) {
    fail(name, e);
    return Promise.resolve();
  }
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('foundation tests\n');

  // --- unit: domain (pure, inward) ---
  await check('domain profiles are pure core constants', () => {
    assert.strictEqual(PROFILE.PUBLIC, 1);
    assert.strictEqual(PROFILE.SUPER_ADMIN, 4);
    assert.strictEqual(roleCode(2), 'P2');
    assert.strictEqual(normalizeProfile(99), PROFILE.SUPER_ADMIN);
    assert.strictEqual(normalizeProfile(-1), PROFILE.PUBLIC);
  });

  // --- unit: context ---
  await check('context has anonymous P1 actor', () => {
    const ctx = createContext({
      req: {},
      res: { headersSent: false, setHeader() {}, end() {} },
      config: {},
      useCases: {},
      data: {},
      log: { info() {}, warn() {}, error() {}, debug() {} },
      requestId: 't1',
      pathname: '/',
      query: {},
    });
    assert.strictEqual(ctx.actor.role, 'P1');
    assert.strictEqual(ctx.actor.profile, PROFILE.PUBLIC);
    assert.strictEqual(ctx.actor.authenticated, false);
    assert.strictEqual(ctx.permissions.canWrite, false);
    assert.strictEqual(typeof ctx.setActor, 'function');
    assert.strictEqual(anonymousActor().profile, PROFILE.PUBLIC);
    assert.ok(ctx.useCases);
  });

  // --- unit: retry ---
  await check('withRetry succeeds after transient failures', async () => {
    let n = 0;
    const val = await withRetry(
      async () => {
        n += 1;
        if (n < 3) {
          const e = new Error('ECONNRESET');
          e.code = 'ECONNRESET';
          throw e;
        }
        return 'ok';
      },
      { attempts: 5, delayMs: 1 }
    );
    assert.strictEqual(val, 'ok');
    assert.strictEqual(n, 3);
  });

  await check('withRetry does not retry permanent AppError', async () => {
    let n = 0;
    try {
      await withRetry(
        async () => {
          n += 1;
          throw new AppError(CODE.VALIDATION, 'bad', { retryable: false });
        },
        { attempts: 4, delayMs: 1 }
      );
      assert.fail('should throw');
    } catch (e) {
      assert.strictEqual(e.code, CODE.VALIDATION);
      assert.strictEqual(n, 1);
    }
  });

  await check('external errors are retryable by default', () => {
    const e = external('blip');
    assert.strictEqual(e.code, CODE.EXTERNAL);
    assert.strictEqual(e.retryable, true);
    assert.strictEqual(isRetryable(e), true);
  });

  // --- unit: app composition (Clean Architecture wiring) ---
  await check('createApp wires data + useCases + http router', () => {
    const app = createApp();
    assert.ok(app.data);
    assert.ok(app.useCases.getHealth);
    assert.strictEqual(typeof app.useCases.getHealth.execute, 'function');
    assert.ok(app.router);
    assert.ok(app.router.list().some((r) => r.includes('/api/health')));
  });

  await check('use-case GetHealth is self-aware without HTTP', async () => {
    const app = createApp();
    const body = await app.useCases.getHealth.execute();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.foundation, true);
    assert.ok(['healthy', 'degraded', 'unhealthy'].includes(body.status));
    assert.ok(body.mode);
    assert.strictEqual(body.mode.storeAdapter, 'memory');
    assert.strictEqual(body.dependencies.data.kind, 'memory');
    assert.strictEqual(body.dependencies.bridge.state, 'disabled');
    assert.ok(body.selfHealing);
    assert.ok(Array.isArray(body.selfHealing.actions));
    assert.ok(body.config);
  });

  await check('domain awareness: blockers => unhealthy', () => {
    const r = evaluateOverall({ blockers: ['x'], dependencyOk: true });
    assert.strictEqual(r.status, LEVEL.UNHEALTHY);
    assert.strictEqual(r.ok, false);
  });

  await check('bootstrap heals live bridge without URL in dev', () => {
    const cfg = Object.freeze({
      ...baseConfig,
      isDev: true,
      isProd: false,
      env: 'development',
      useLiveBridge: true,
      bridgeUrl: '',
      bridgeSecret: '',
      storeAdapter: 'memory',
    });
    const app = createApp({ config: cfg });
    assert.strictEqual(app.config.useLiveBridge, false);
    assert.ok(app.bootstrap.heals.some((h) => h.action === 'disable_live_bridge'));
    assert.strictEqual(app.bootstrap.ready, true);
  });

  await check('bootstrap heals unknown store adapter in dev', () => {
    const cfg = Object.freeze({
      ...baseConfig,
      isDev: true,
      isProd: false,
      env: 'development',
      storeAdapter: 'sheets',
      useLiveBridge: false,
    });
    const app = createApp({ config: cfg });
    assert.strictEqual(app.config.storeAdapter, 'memory');
    assert.ok(app.bootstrap.heals.some((h) => h.action === 'store_adapter_fallback_memory'));
  });

  // --- HTTP ---
  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;

  try {
    {
      const r = await request(port, 'GET', '/api/health');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.strictEqual(r.json.foundation, true);
      assert.ok(r.json.app);
      assert.ok(r.json.version);
      assert.ok(r.json.status);
      assert.ok(r.json.mode);
      assert.ok(r.json.config);
      assert.ok(r.json.dependencies);
      assert.strictEqual(r.json.dependencies.data.kind, 'memory');
      assert.strictEqual(r.json.dependencies.data.ok, true);
      assert.strictEqual(r.json.dependencies.bridge.state, 'disabled');
      assert.ok(r.json.selfHealing);
      ok('GET /api/health self-aware report');
    }

    {
      const r = await request(port, 'GET', '/api');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.ok(Array.isArray(r.json.routes));
      assert.ok(r.json.actor);
      assert.strictEqual(r.json.actor.role, 'P1');
      ok('GET /api lists routes + actor baseline');
    }

    {
      const r = await request(port, 'GET', '/api/nope');
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.json.ok, false);
      assert.strictEqual(r.json.error.code, 'not_found');
      assert.ok(r.json.error.requestId);
      ok('GET /api/nope → 404 error envelope');
    }

    {
      const r = await request(port, 'POST', '/api/login', { username: 'x', password: 'y' });
      assert.strictEqual(r.status, 401);
      ok('POST /api/login rejects bad credentials (401)');
    }

    {
      const r = await request(port, 'GET', '/');
      assert.strictEqual(r.status, 200);
      assert.ok(r.headers['content-type'] && r.headers['content-type'].includes('text/html'));
      assert.ok(r.raw.includes('ts-3') || r.raw.includes('foundation'));
      ok('GET / serves frontend/index.html');
    }

    {
      const r = await request(port, 'GET', '/../package.json');
      assert.ok(r.status === 404 || r.status === 400);
      ok('path traversal does not serve package.json');
    }

    {
      const r = await request(port, 'GET', '/api/health');
      assert.ok(r.headers['x-request-id']);
      ok('X-Request-Id response header');
    }

    {
      const r = await request(port, 'GET', '/api/health');
      assert.strictEqual(r.json.foundation, true);
      assert.strictEqual(r.json.slice, '03');
      assert.ok(r.json.mode && r.json.mode.appMode === 'staging');
      ok('health reports slice 03 + staging mode');
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
