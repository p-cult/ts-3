'use strict';

/**
 * Tiny retry helper for external I/O (bridge / Sheets later).
 * No dependencies. Fail loud after attempts. Not for business-rule errors.
 */

const { AppError, CODE } = require('../errors');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryable(err) {
  if (!err) return false;
  if (err.retryable === true) return true;
  if (err instanceof AppError) {
    return err.code === CODE.EXTERNAL || err.code === CODE.RATE_LIMIT;
  }
  const code = err.code || err.errno;
  // Common Node network codes
  if (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'EPIPE'
  ) {
    return true;
  }
  const msg = String(err.message || err);
  if (/timeout|temporar|ECONN|socket hang up|503|502|429/i.test(msg)) return true;
  return false;
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{
 *   attempts?: number,
 *   delayMs?: number,
 *   maxDelayMs?: number,
 *   factor?: number,
 *   label?: string,
 *   log?: { warn: Function },
 *   shouldRetry?: (err: unknown, attempt: number) => boolean,
 * }} [opts]
 * @returns {Promise<T>}
 */
async function withRetry(fn, opts = {}) {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const delayMs = opts.delayMs ?? 50;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  const factor = opts.factor ?? 2;
  const shouldRetry = opts.shouldRetry || isRetryable;
  const log = opts.log;
  const label = opts.label || 'external';

  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retry = attempt < attempts && shouldRetry(err, attempt);
      if (!retry) throw err;
      const wait = Math.min(maxDelayMs, delayMs * Math.pow(factor, attempt - 1));
      if (log && log.warn) {
        log.warn('retrying external call', {
          label,
          attempt,
          attempts,
          waitMs: wait,
          err: String(err && err.message ? err.message : err),
        });
      }
      await sleep(wait);
    }
  }
  throw lastErr;
}

module.exports = { withRetry, isRetryable, sleep };
