'use strict';

/**
 * Minimal method + path router.
 * Supports exact paths and simple :param segments.
 *
 * handlers receive (ctx) — see server.js
 */

function compilePath(pattern) {
  const normalized = (pattern.startsWith('/') ? pattern : `/${pattern}`).replace(/\/+$/, '') || '/';
  if (normalized === '/') {
    return { re: /^\/$/, keys: [], pattern: '/' };
  }
  const parts = normalized.split('/').filter(Boolean);
  const keys = [];
  const reParts = parts.map((p) => {
    if (p.startsWith(':')) {
      keys.push(p.slice(1));
      return '([^/]+)';
    }
    return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const re = new RegExp('^/' + reParts.join('/') + '$');
  return { re, keys, pattern: normalized };
}

function createRouter() {
  /** @type {{ method: string, re: RegExp, keys: string[], pattern: string, handler: Function }[]} */
  const routes = [];

  function add(method, pattern, handler) {
    const { re, keys, pattern: normalized } = compilePath(pattern);
    routes.push({
      method: method.toUpperCase(),
      re,
      keys,
      pattern: normalized,
      handler,
    });
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    patch: (p, h) => add('PATCH', p, h),
    put: (p, h) => add('PUT', p, h),
    delete: (p, h) => add('DELETE', p, h),
    add,
    /**
     * @returns {{ handler: Function, params: Record<string,string>, pattern: string } | null}
     */
    match(method, pathname) {
      const m = (method || 'GET').toUpperCase();
      const path = (pathname || '/').replace(/\/+$/, '') || '/';
      for (const route of routes) {
        if (route.method !== m) continue;
        const hit = path.match(route.re);
        if (!hit) continue;
        const params = Object.create(null);
        route.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(hit[i + 1]);
        });
        return { handler: route.handler, params, pattern: route.pattern };
      }
      return null;
    },
    list() {
      return routes.map((r) => `${r.method} ${r.pattern}`);
    },
  };
}

module.exports = { createRouter, compilePath };
