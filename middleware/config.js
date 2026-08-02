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

  host: envString(
    'HOST',
    NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'
  ),
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
  /** Master spreadsheet id (same live Master as ts-2). Used by thin-bridge fallback. */
  masterSheetId: envString(
    'MASTER_ID',
    envString('MASTER_SHEET_ID', '1v3rliP07LU_UEbALN64nWlUP7ut8SSDvuIEOAwM2B0E')
  ),
  /** auto | semantic | thin — auto speaks ts-3 actions then falls back to ts-2 read/write */
  bridgeProtocol: envString('BRIDGE_PROTOCOL', 'auto'),

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
   * Who may mint/write on live sheets.
   * Before cutover: ts2 (public) — ts-3 refuses writes unless supervised staging.
   * After cutover: ts3 — sole reader/writer (APP_MODE=production).
   */
  writerOfRecord: envString('WRITER_OF_RECORD', 'ts2'),

  /** Queue untrusted creates (P2) — default off until Vinod enables */
  queueMode: envString('QUEUE_MODE', 'off'),

  /** Production split: GitHub Pages UI origin allowed on API (empty = same-origin only) */
  corsOrigin: envString('CORS_ORIGIN', ''),

  /**
   * When true, birth writes await the live bridge (not write-behind).
   * Default on for APP_MODE=production so a crash cannot drop a minted Task ID.
   * Patches still use the outbox worker.
   */
  outboxAwaitBirth: envBool(
    'OUTBOX_AWAIT_BIRTH',
    envString('APP_MODE', 'staging') === 'production'
  ),

  /** Sliding-window rate limits (login + state-changing /api writes) */
  rateWindowMs: envInt('RATE_WINDOW_MS', 60000),
  /** Generous for integration tests; tighten via env on public Render. */
  rateMaxLogins: envInt('RATE_MAX_LOGINS', 60),
  rateMaxWrites: envInt('RATE_MAX_WRITES', 300),

  /** Defaults for data/retry.withRetry on external I/O */
  retry: Object.freeze({
    attempts: envInt('RETRY_ATTEMPTS', 3),
    delayMs: envInt('RETRY_DELAY_MS', 50),
    maxDelayMs: envInt('RETRY_MAX_DELAY_MS', 2000),
  }),
});

module.exports = { config, ROOT };
