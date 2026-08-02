'use strict';

/**
 * POST JSON to Apps Script web apps.
 * Follows POST→302→GET (Google's pattern). Custom fetchImpl skips redirect logic.
 */

const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_REDIRECTS = 3;

function normalizeBody(raw) {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .trim();
}

/**
 * @param {string} url
 * @param {object} payload
 * @param {{ timeoutMs?: number, fetchImpl?: Function, headers?: object }} opts
 * @returns {Promise<{ status: number, json: object|null, text: string }>}
 */
async function postJson(url, payload, opts = {}) {
  const body = JSON.stringify(payload);
  const fetchImpl = opts.fetchImpl;
  const headers = Object.assign(
    {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    opts.headers || {}
  );

  if (typeof fetchImpl === 'function') {
    const res = await fetchImpl(url, { method: 'POST', headers, body });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(normalizeBody(text)) : null;
    } catch {
      json = null;
    }
    return { status: res.status || 0, json, text };
  }

  return postJsonNode(url, body, headers, Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS);
}

function transportFor(urlStr) {
  return String(urlStr).startsWith('http://') ? http : https;
}

function postJsonNode(startUrl, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    let start;
    try {
      start = new URL(startUrl);
    } catch (err) {
      return reject(err);
    }

    let redirects = 0;
    const doRequest = (urlObj, method, postBody) => {
      const lib = transportFor(urlObj.href);
      const reqHeaders =
        method === 'POST'
          ? Object.assign({}, headers, {
              'Content-Length': Buffer.byteLength(postBody),
            })
          : { Accept: 'application/json' };
      const req = lib.request(
        {
          method,
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          headers: reqHeaders,
        },
        (res) => {
          const code = res.statusCode || 0;
          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            if (redirects >= MAX_REDIRECTS) {
              return reject(new Error('bridge redirected too many times'));
            }
            redirects += 1;
            let next;
            try {
              next = new URL(res.headers.location, urlObj.href);
            } catch (e) {
              return reject(new Error('bridge redirect had bad location'));
            }
            return doRequest(next, 'GET', null);
          }
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            const text = normalizeBody(data);
            let json = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {
              json = null;
            }
            resolve({ status: code, json, text });
          });
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('bridge request timed out'));
      });
      if (method === 'POST' && postBody != null) req.write(postBody);
      req.end();
    };

    doRequest(start, 'POST', body);
  });
}

module.exports = { postJson, normalizeBody };
