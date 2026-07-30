'use strict';

/**
 * Application errors + HTTP error responses.
 * Business slices throw AppError; the server maps them to JSON.
 */

const { log } = require('./log');

const CODE = Object.freeze({
  BAD_REQUEST: 'bad_request',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMIT: 'rate_limit',
  VALIDATION: 'validation',
  INTERNAL: 'internal',
  NOT_IMPLEMENTED: 'not_implemented',
  /** Upstream bridge / Sheets / network — often retryable */
  EXTERNAL: 'external',
});

const DEFAULT_STATUS = Object.freeze({
  [CODE.BAD_REQUEST]: 400,
  [CODE.VALIDATION]: 400,
  [CODE.UNAUTHORIZED]: 401,
  [CODE.FORBIDDEN]: 403,
  [CODE.NOT_FOUND]: 404,
  [CODE.CONFLICT]: 409,
  [CODE.RATE_LIMIT]: 429,
  [CODE.NOT_IMPLEMENTED]: 501,
  [CODE.EXTERNAL]: 502,
  [CODE.INTERNAL]: 500,
});

class AppError extends Error {
  /**
   * @param {string} code - machine code from CODE
   * @param {string} message - human-safe message
   * @param {{ status?: number, details?: object, expose?: boolean, retryable?: boolean }} [opts]
   */
  constructor(code, message, opts = {}) {
    super(message || code);
    this.name = 'AppError';
    this.code = code || CODE.INTERNAL;
    this.status = opts.status || DEFAULT_STATUS[this.code] || 500;
    this.details = opts.details || undefined;
    /** If false, client gets a generic message (for unexpected internals). */
    this.expose = opts.expose !== undefined ? opts.expose : this.status < 500;
    /** Hint for data/retry.withRetry — external blips vs permanent faults. */
    this.retryable =
      opts.retryable !== undefined
        ? !!opts.retryable
        : this.code === CODE.EXTERNAL || this.code === CODE.RATE_LIMIT;
  }
}

function badRequest(message, details) {
  return new AppError(CODE.BAD_REQUEST, message, { details });
}
function unauthorized(message = 'Authentication required') {
  return new AppError(CODE.UNAUTHORIZED, message);
}
function forbidden(message = 'Not allowed') {
  return new AppError(CODE.FORBIDDEN, message);
}
function notFound(message = 'Not found') {
  return new AppError(CODE.NOT_FOUND, message);
}
function conflict(message, details) {
  return new AppError(CODE.CONFLICT, message, { details });
}
function validation(message, details) {
  return new AppError(CODE.VALIDATION, message, { details });
}
function notImplemented(message = 'Not implemented') {
  return new AppError(CODE.NOT_IMPLEMENTED, message, { retryable: false });
}
function internal(message = 'Internal error', details) {
  return new AppError(CODE.INTERNAL, message, { details, expose: false, retryable: false });
}
/** Upstream failure (bridge/Sheets/network). Default retryable. */
function external(message = 'Upstream service error', details) {
  return new AppError(CODE.EXTERNAL, message, {
    details,
    expose: true,
    retryable: true,
  });
}

/**
 * Write a standard error JSON body and end the response.
 * @param {import('http').ServerResponse} res
 * @param {unknown} err
 * @param {{ requestId?: string, isDev?: boolean }} [ctx]
 */
function sendError(res, err, ctx = {}) {
  if (res.headersSent) {
    log.error('error after headers sent', {
      requestId: ctx.requestId,
      err: String(err && err.message ? err.message : err),
    });
    return;
  }

  let status = 500;
  let code = CODE.INTERNAL;
  let message = 'Internal error';
  let details;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.expose ? err.message : 'Internal error';
    details = err.expose ? err.details : undefined;
    if (status >= 500) {
      log.error(err.message, {
        requestId: ctx.requestId,
        code: err.code,
        stack: err.stack,
      });
    } else {
      log.warn(err.message, {
        requestId: ctx.requestId,
        code: err.code,
        status,
      });
    }
  } else if (err && err.message) {
    log.error(err.message, {
      requestId: ctx.requestId,
      stack: err.stack,
    });
    if (ctx.isDev) {
      message = err.message;
      details = { name: err.name };
    }
  } else {
    log.error('unknown error', { requestId: ctx.requestId, err: String(err) });
  }

  const body = {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    },
  };

  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

module.exports = {
  AppError,
  CODE,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validation,
  notImplemented,
  internal,
  external,
  sendError,
};
