'use strict';

/**
 * Thin Apps Script bridge HTTP client.
 * Browser never calls this — middleware only.
 *
 * Contract actions (aligned with ts-2 thin bridge spirit, not ts-2 source):
 *   ping | getDepot | getVehicle | getProjects | getUsers
 *   writeVehicle | writeDepot | writeMapping  (Staging writes gated upstream)
 */

const { external } = require('../errors');

/**
 * @param {{ bridgeUrl: string, bridgeSecret: string, fetchImpl?: Function, log?: object }} opts
 */
function createBridgeClient(opts) {
  const url = String(opts.bridgeUrl || '').replace(/\/$/, '');
  const secret = String(opts.bridgeSecret || '');
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const log = opts.log || { debug() {}, warn() {} };

  if (!url || !secret) {
    return {
      configured: false,
      async ping() {
        return { ok: false, state: 'misconfigured', message: 'BRIDGE_URL/SECRET missing' };
      },
      async call() {
        throw external('bridge not configured');
      },
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      configured: true,
      async ping() {
        return {
          ok: false,
          state: 'unavailable',
          message: 'fetch not available in this Node runtime',
        };
      },
      async call() {
        throw external('bridge fetch unavailable');
      },
    };
  }

  async function call(action, payload) {
    const body = JSON.stringify({
      action,
      token: secret,
      ...(payload || {}),
    });
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + secret,
        },
        body,
      });
    } catch (err) {
      log.warn('bridge network error', { action, err: String(err && err.message) });
      throw external('bridge unreachable: ' + (err && err.message ? err.message : err));
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw external('bridge returned non-JSON (' + res.status + ')');
    }
    if (!res.ok || (json && json.ok === false)) {
      throw external(
        (json && (json.error || json.message)) || 'bridge error HTTP ' + res.status
      );
    }
    return json;
  }

  return {
    configured: true,
    call,
    async ping() {
      try {
        const r = await call('ping', {});
        return { ok: true, state: 'ok', message: 'bridge reachable', detail: r };
      } catch (err) {
        return {
          ok: false,
          state: 'unavailable',
          message: String(err && err.message ? err.message : err),
        };
      }
    },
    getDepot: () => call('getDepot', {}),
    getVehicle: (userSheet) => call('getVehicle', { userSheet }),
    getProjects: () => call('getProjects', {}),
    getUsers: () => call('getUsers', {}),
    writeVehicle: (payload) => call('writeVehicle', payload),
    writeDepot: (payload) => call('writeDepot', payload),
    writeMapping: (payload) => call('writeMapping', payload),
  };
}

module.exports = { createBridgeClient };
