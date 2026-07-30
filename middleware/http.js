'use strict';

/**
 * Small HTTP helpers — no framework.
 */

const { badRequest } = require('./errors');

const DEFAULT_BODY_LIMIT = 1_000_000; // 1 MB

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object|string|Buffer|null} body
 * @param {Record<string, string>} [headers]
 */
function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const payload =
    body === null || body === undefined
      ? ''
      : typeof body === 'string' || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body);
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', buf.length);
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined && v !== null) res.setHeader(k, v);
  }
  res.end(buf);
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {string|Buffer} body
 * @param {string} contentType
 * @param {Record<string, string>} [headers]
 */
function sendRaw(res, status, body, contentType, headers = {}) {
  if (res.headersSent) return;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', buf.length);
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined && v !== null) res.setHeader(k, v);
  }
  res.end(buf);
}

/**
 * Read full request body as Buffer with size limit.
 * @param {import('http').IncomingMessage} req
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Buffer>}
 */
function readBody(req, opts = {}) {
  const limit = opts.limit ?? DEFAULT_BODY_LIMIT;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let done = false;

    function fail(err) {
      if (done) return;
      done = true;
      reject(err);
    }

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        fail(badRequest('Request body too large', { limit }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', fail);
  });
}

/**
 * Read body and parse JSON object. Empty body → {}.
 * @param {import('http').IncomingMessage} req
 * @param {{ limit?: number }} [opts]
 */
async function readJson(req, opts = {}) {
  const buf = await readBody(req, opts);
  if (!buf.length) return {};
  const text = buf.toString('utf8').trim();
  if (!text) return {};
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw badRequest('Invalid JSON body');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw badRequest('JSON body must be an object');
  }
  return data;
}

/**
 * Parse pathname + query from req.url
 * @param {import('http').IncomingMessage} req
 */
function parseRequestUrl(req) {
  const host = req.headers.host || 'localhost';
  const u = new URL(req.url || '/', `http://${host}`);
  const query = Object.create(null);
  for (const [k, v] of u.searchParams.entries()) query[k] = v;
  return {
    pathname: u.pathname.replace(/\/+$/, '') || '/',
    query,
    search: u.search,
  };
}

/** @param {import('http').IncomingMessage} req */
function requestId(req) {
  const h = req.headers['x-request-id'];
  if (typeof h === 'string' && h.trim()) return h.trim().slice(0, 80);
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  sendJson,
  sendRaw,
  readBody,
  readJson,
  parseRequestUrl,
  requestId,
  DEFAULT_BODY_LIMIT,
};
