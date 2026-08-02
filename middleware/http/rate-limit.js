'use strict';

/**
 * Featherweight sliding-window rate limiter (no deps).
 * Ported from ts-2 request protection.
 */

function createRateLimiter(opts = {}) {
  const windowMs = Math.max(1000, Number(opts.windowMs) || 60000);
  const hits = new Map(); // key -> timestamps[]

  function underLimit(key, max) {
    const now = Date.now();
    const limit = Math.max(1, Number(max) || 1);
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    return arr.length <= limit;
  }

  function sweep() {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const live = arr.filter((t) => now - t < windowMs);
      if (live.length) hits.set(k, live);
      else hits.delete(k);
    }
  }

  const timer = setInterval(sweep, windowMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    windowMs,
    underLimit,
    sweep,
    size: () => hits.size,
    stop() {
      clearInterval(timer);
      hits.clear();
    },
  };
}

function clientIp(req) {
  const fwd = String((req && req.headers && req.headers['x-forwarded-for']) || '')
    .split(',')[0]
    .trim();
  if (fwd) return fwd;
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { createRateLimiter, clientIp };
