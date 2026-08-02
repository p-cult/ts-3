'use strict';

/**
 * Configuration — env vars with safe defaults.
 * No secrets required for the foundation slice.
 * Optional local file: project root `.env` (KEY=VALUE lines only).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

function envString(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

const NODE_ENV = envString('NODE_ENV', 'development');

const config = Object.freeze({
  rootDir: ROOT,
  middlewareDir: __dirname,
  frontendDir: path.join(ROOT, 'frontend'),
  dataDir: path.join(ROOT, 'data'),

  env: NODE_ENV,
  isDev: NODE_ENV !== 'production',
  isProd: NODE_ENV === 'production',

  host: envString('HOST', '127.0.0.1'),
  port: envInt('PORT', 4303),

  /** error | warn | info | debug */
  logLevel: envString('LOG_LEVEL', NODE_ENV === 'production' ? 'info' : 'debug'),

  /** App identity for health / logs */
  appName: 'param-task-ts3',
  appVersion: '0.1.0',
  foundation: true,

  /** Reserved for later slices — read here so one place owns names */
  sessionSecret: envString('SESSION_SECRET', ''),
  bridgeUrl: envString('BRIDGE_URL', ''),
  bridgeSecret: envString('BRIDGE_SECRET', ''),

  /**
   * Data adapter: memory (default) | sheets (future).
   * Only memory is implemented in foundation.
   */
  storeAdapter: envString('STORE_ADAPTER', 'memory'),

  /** Safety: never enable live bridge by accident in foundation */
  useLiveBridge: envBool('USE_LIVE_BRIDGE', false),

  /** Optional override for sheets adapter fixture (CI / offline). Live bridge ignores after hydrate. */
  sheetsFixturePath: envString('SHEETS_FIXTURE_PATH', ''),

  /** staging until go-live; production only after cutover */
  appMode: envString('APP_MODE', 'staging'),

  /** live sheet writes in staging — default off */
  stagingWrites: envBool('STAGING_WRITES', false),

  /**
   * Who may mint/write on live sheets before go-live.
   * Default ts2 = public writer-of-record; ts3 only for supervised Staging tests.
   */
  writerOfRecord: envString('WRITER_OF_RECORD', 'ts2'),

  /** Queue untrusted creates (P2) — default off until Vinod enables */
  queueMode: envString('QUEUE_MODE', 'off'),

  /** Production split: GitHub Pages UI origin allowed on API (empty = same-origin only) */
  corsOrigin: envString('CORS_ORIGIN', ''),

  /** Defaults for data/retry.withRetry on external I/O */
  retry: Object.freeze({
    attempts: envInt('RETRY_ATTEMPTS', 3),
    delayMs: envInt('RETRY_DELAY_MS', 50),
    maxDelayMs: envInt('RETRY_MAX_DELAY_MS', 2000),
  }),
});

module.exports = { config, ROOT };
