'use strict';

/**
 * runtime/bootstrap.js — startup checks + basic self-healing (outer layer).
 *
 * Heals common foot-guns without hiding production danger:
 * - ensure data directory exists
 * - invalid STORE_ADAPTER → memory in development (loud); block in production
 * - USE_LIVE_BRIDGE without URL/secret → disable bridge in development; block in production
 * - missing frontend/index.html → notice (server can still serve API)
 *
 * Does not implement product features. Does not talk HTTP.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {{ config: object, log?: object, runtime: object }} deps
 * @returns {{ config: object, ready: boolean, issues: object[], heals: object[] }}
 */
function bootstrap(deps) {
  const log = deps.log || { info() {}, warn() {}, error() {}, debug() {} };
  const runtime = deps.runtime;
  const base = deps.config;

  // Shallow mutable copy of config flags we may heal (freeze broken after)
  const cfg = {
    ...base,
    retry: base.retry ? { ...base.retry } : undefined,
  };

  const issues = [];
  const heals = [];

  function issue(severity, code, message, hint) {
    const row = { severity, code, message, hint };
    issues.push(row);
    if (severity === 'error') {
      runtime.recordBlocker(message, hint);
    }
  }

  function heal(action, detail, mutate) {
    if (typeof mutate === 'function') mutate();
    const row = { action, detail };
    heals.push(row);
    runtime.recordHeal(row);
    log.warn('self-heal', { action, detail });
  }

  // --- Node version (informational) ---
  const major = Number.parseInt(String(process.versions.node).split('.')[0], 10);
  if (!Number.isFinite(major) || major < 18) {
    issue(
      'error',
      'node_version',
      `Node ${process.versions.node} is too old (need >= 18)`,
      'Install Node 18+ and re-run ./run.sh'
    );
  }

  // --- data directory ---
  const dataDir = cfg.dataDir;
  try {
    if (dataDir && !fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      heal('create_data_dir', dataDir);
    } else if (dataDir && fs.existsSync(dataDir) && !fs.statSync(dataDir).isDirectory()) {
      issue('error', 'data_dir', `dataDir exists but is not a directory: ${dataDir}`);
    }
  } catch (err) {
    issue(
      'error',
      'data_dir',
      `cannot prepare dataDir: ${err.message}`,
      `Check permissions on ${dataDir}`
    );
  }

  // --- frontend presence ---
  const indexHtml = path.join(cfg.frontendDir || '', 'index.html');
  if (!fs.existsSync(indexHtml)) {
    issue(
      'warn',
      'frontend_missing',
      'frontend/index.html not found — UI will 404',
      'Restore frontend/index.html'
    );
    runtime.recordNotice('frontend/index.html missing');
  }

  // --- store adapter ---
  const adapter = String(cfg.storeAdapter || 'memory').toLowerCase();
  if (adapter !== 'memory') {
    if (cfg.isProd) {
      issue(
        'error',
        'store_adapter',
        `STORE_ADAPTER=${adapter} is not implemented yet`,
        'Set STORE_ADAPTER=memory until the Sheets adapter ships'
      );
    } else {
      heal(
        'store_adapter_fallback_memory',
        `requested ${adapter} → memory (dev)`,
        () => {
          cfg.storeAdapter = 'memory';
        }
      );
      issue(
        'warn',
        'store_adapter',
        `STORE_ADAPTER=${adapter} not implemented; using memory`,
        'Only memory is available in foundation'
      );
    }
  }

  // --- live bridge configuration ---
  if (cfg.useLiveBridge) {
    const missing = [];
    if (!cfg.bridgeUrl) missing.push('BRIDGE_URL');
    if (!cfg.bridgeSecret) missing.push('BRIDGE_SECRET');
    if (missing.length) {
      const msg = `USE_LIVE_BRIDGE=true but missing ${missing.join(', ')}`;
      if (cfg.isProd) {
        issue(
          'error',
          'bridge_config',
          msg,
          'Set bridge env vars or USE_LIVE_BRIDGE=false'
        );
      } else {
        heal(
          'disable_live_bridge',
          msg,
          () => {
            cfg.useLiveBridge = false;
          }
        );
        issue(
          'warn',
          'bridge_config',
          `${msg} — bridge disabled for this process`,
          'Set BRIDGE_URL and BRIDGE_SECRET or leave USE_LIVE_BRIDGE=false'
        );
      }
    }
  }

  // --- production session secret (prep for auth; not required until Slice 01) ---
  if (cfg.isProd && !cfg.sessionSecret) {
    issue(
      'warn',
      'session_secret',
      'SESSION_SECRET empty in production',
      'Set SESSION_SECRET before enabling login (Slice 01)'
    );
  }

  const ready = !issues.some((i) => i.severity === 'error');
  runtime.setBootstrapOk(ready);
  if (ready) {
    log.info('bootstrap ok', {
      heals: heals.length,
      warnings: issues.filter((i) => i.severity === 'warn').length,
      store: cfg.storeAdapter,
      liveBridge: cfg.useLiveBridge,
    });
  } else {
    log.error('bootstrap blocked', {
      errors: issues.filter((i) => i.severity === 'error').map((i) => i.message),
    });
  }

  // Freeze healed config like main config
  const frozen = Object.freeze({
    ...cfg,
    retry: cfg.retry ? Object.freeze({ ...cfg.retry }) : cfg.retry,
  });

  return {
    config: frozen,
    ready,
    issues,
    heals,
  };
}

module.exports = { bootstrap };
