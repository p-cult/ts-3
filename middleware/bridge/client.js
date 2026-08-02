'use strict';

/**
 * Apps Script bridge HTTP client (middleware only).
 *
 * Semantic actions (ts-3 bridge.gs):
 *   ping | getDepot | getVehicle | getProjects | getUsers
 *   writeVehicle | writeDepot | writeMapping
 *
 * Live deploy today is often the ts-2 thin bridge:
 *   read | write | listen | react | readMany | dropdown
 *
 * protocol: auto (default) | semantic | thin
 *   auto → try semantic; on "unknown action" lock into thin and map Master tabs.
 */

const { external } = require('../errors');
const { postJson } = require('./http-post');
const { createThinMasterApi } = require('./thin-master');

const DEFAULT_MASTER_ID = '1v3rliP07LU_UEbALN64nWlUP7ut8SSDvuIEOAwM2B0E';

/**
 * @param {{
 *   bridgeUrl: string,
 *   bridgeSecret: string,
 *   masterSheetId?: string,
 *   bridgeProtocol?: 'auto'|'semantic'|'thin',
 *   fetchImpl?: Function,
 *   log?: object,
 *   timeoutMs?: number,
 * }} opts
 */
function createBridgeClient(opts) {
  const url = String(opts.bridgeUrl || '').replace(/\/$/, '');
  const secret = String(opts.bridgeSecret || '');
  const masterId = String(opts.masterSheetId || process.env.MASTER_ID || process.env.MASTER_SHEET_ID || DEFAULT_MASTER_ID);
  const fetchImpl = opts.fetchImpl;
  const log = opts.log || { debug() {}, warn() {} };
  let protocol = String(opts.bridgeProtocol || process.env.BRIDGE_PROTOCOL || 'auto').toLowerCase();
  if (protocol !== 'semantic' && protocol !== 'thin' && protocol !== 'auto') {
    protocol = 'auto';
  }
  let protocolReady = null;

  if (!url || !secret) {
    return {
      configured: false,
      protocol: 'none',
      async ping() {
        return { ok: false, state: 'misconfigured', message: 'BRIDGE_URL/SECRET missing' };
      },
      async call() {
        throw external('bridge not configured');
      },
    };
  }

  // One Apps Script execution at a time — parallel reads/writes yield HTML 200 error pages.
  let bridgeGate = Promise.resolve();
  function enqueueBridge(fn) {
    const run = bridgeGate.then(fn, fn);
    bridgeGate = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function looksLikeAppsScriptHtml(text) {
    const t = String(text || '');
    return (
      /<!DOCTYPE html/i.test(t) ||
      /<html[\s>]/i.test(t) ||
      /ppConfig/i.test(t) ||
      /script\.google\.com/i.test(t)
    );
  }

  async function callOnce(action, payload) {
    const body = {
      action,
      token: secret,
      ...(payload || {}),
    };
    const attempts = 5;
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      let res;
      try {
        res = await postJson(url, body, {
          fetchImpl,
          timeoutMs: opts.timeoutMs,
          headers: { Authorization: 'Bearer ' + secret },
        });
      } catch (err) {
        lastErr = err;
        log.warn('bridge network error', {
          action,
          attempt: i + 1,
          err: String(err && err.message),
        });
        if (i + 1 < attempts) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
          continue;
        }
        throw external('bridge unreachable: ' + (err && err.message ? err.message : err));
      }

      const json = res.json;
      if (!json || typeof json !== 'object') {
        const preview = String(res.text || '').slice(0, 120).replace(/\s+/g, ' ');
        const html = looksLikeAppsScriptHtml(res.text);
        lastErr = new Error(
          html
            ? 'Google Sheets bridge busy (Apps Script HTML error) — try again in a few seconds'
            : 'bridge returned non-JSON (' + res.status + ')' + (preview ? ': ' + preview : '')
        );
        log.warn('bridge bad body', { action, attempt: i + 1, preview, html });
        if (i + 1 < attempts) {
          await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, i)));
          continue;
        }
        throw external(lastErr.message);
      }
      if (res.status >= 400 || json.ok === false) {
        throw external(json.error || json.message || 'bridge error HTTP ' + res.status);
      }
      return json;
    }
    throw external(String(lastErr && lastErr.message ? lastErr.message : lastErr));
  }

  function call(action, payload) {
    return enqueueBridge(() => callOnce(action, payload));
  }

  let thin = null;
  function ensureThin() {
    if (!thin) {
      thin = createThinMasterApi({ call, masterId, log });
    }
    return thin;
  }

  function isUnknownAction(err) {
    return /unknown action/i.test(String((err && err.message) || ''));
  }

  /** Resolve auto → semantic|thin once (avoids parallel unknown-action storms). */
  async function resolveProtocol() {
    if (protocol !== 'auto') return protocol;
    if (!protocolReady) {
      protocolReady = (async () => {
        try {
          await call('ping', {});
          protocol = 'semantic';
        } catch (err) {
          if (!isUnknownAction(err)) throw err;
          log.warn('bridge semantic action missing — using ts-2 thin protocol', {
            err: String(err && err.message),
          });
          protocol = 'thin';
        }
        return protocol;
      })().catch((err) => {
        protocolReady = null;
        throw err;
      });
    }
    return protocolReady;
  }

  async function withProtocol(semanticFn, thinFn) {
    const mode = await resolveProtocol();
    if (mode === 'thin') return thinFn(ensureThin());
    return semanticFn();
  }

  return {
    configured: true,
    get protocol() {
      return protocol;
    },
    masterSheetId: masterId,
    call,
    async ping() {
      return withProtocol(
        async () => {
          const r = await call('ping', {});
          return { ok: true, state: 'ok', message: 'bridge reachable', detail: r, protocol: 'semantic' };
        },
        (api) => api.ping()
      );
    },
    getDepot: () =>
      withProtocol(
        () => call('getDepot', {}),
        (api) => api.getDepot()
      ),
    getVehicle: (userSheet) =>
      withProtocol(
        () => call('getVehicle', { userSheet }),
        (api) => api.getVehicle(userSheet)
      ),
    getProjects: () =>
      withProtocol(
        () => call('getProjects', {}),
        (api) => api.getProjects()
      ),
    getUsers: () =>
      withProtocol(
        () => call('getUsers', {}),
        (api) => api.getUsers()
      ),
    writeVehicle: (payload) =>
      withProtocol(
        () => call('writeVehicle', payload),
        (api) => api.writeVehicle(payload)
      ),
    writeDepot: (payload) =>
      withProtocol(
        () => call('writeDepot', payload),
        (api) => api.writeDepot(payload)
      ),
    writeMapping: (payload) =>
      withProtocol(
        () => call('writeMapping', payload),
        (api) => api.writeMapping(payload)
      ),
    writeBatch: (payload) =>
      withProtocol(
        () => call('writeBatch', payload),
        (api) => api.writeBatch(payload)
      ),
  };
}

module.exports = { createBridgeClient, DEFAULT_MASTER_ID };
