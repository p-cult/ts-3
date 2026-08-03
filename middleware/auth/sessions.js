'use strict';

/**
 * Signed Bearer sessions (survive Render restarts).
 * Token = base64url(JSON payload) + '.' + HMAC-SHA256(payload, SESSION_SECRET)
 * Optional in-memory cache for hot path; verify rebuilds after process restart.
 */

const crypto = require('crypto');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function timingSafeEqualStr(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) {
    const pad = Buffer.alloc(Math.max(aa.length, 1));
    crypto.timingSafeEqual(pad, pad);
    return false;
  }
  if (aa.length === 0) return false;
  return crypto.timingSafeEqual(aa, bb);
}

/**
 * @param {{ secret?: string }} [opts]
 */
function createSessionStore(opts = {}) {
  const secret = String(
    opts.secret || process.env.SESSION_SECRET || 'dev-ref-secret'
  );
  /** @type {Map<string, object>} */
  const byToken = new Map();

  function now() {
    return Date.now();
  }

  function signBody(body) {
    return crypto.createHmac('sha256', secret).update(body).digest('base64url');
  }

  function encodeToken(payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return body + '.' + signBody(body);
  }

  function decodeToken(token) {
    const raw = String(token || '');
    const i = raw.lastIndexOf('.');
    if (i <= 0) return null;
    const body = raw.slice(0, i);
    const sig = raw.slice(i + 1);
    if (!timingSafeEqualStr(sig, signBody(body))) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  function sessionFromPayload(payload, token) {
    return {
      token,
      csrfToken: payload.c,
      username: payload.u,
      displayName: payload.d || '',
      profile: payload.p,
      userSheet: payload.s || '',
      employeeId: payload.e || '',
      createdAt: payload.iat || now(),
      expiresAt: payload.exp,
    };
  }

  function prune() {
    const t = now();
    for (const [tok, s] of byToken.entries()) {
      if (!s || s.expiresAt <= t) byToken.delete(tok);
    }
  }

  function create(user) {
    prune();
    const csrfToken = crypto.randomBytes(16).toString('base64url');
    const iat = now();
    const payload = {
      u: user.username,
      d: user.displayName || '',
      p: user.profile,
      s: user.userSheet || '',
      e: user.employeeId || '',
      c: csrfToken,
      iat,
      exp: iat + SESSION_TTL_MS,
    };
    const token = encodeToken(payload);
    const session = sessionFromPayload(payload, token);
    byToken.set(token, session);
    return {
      token: session.token,
      csrfToken: session.csrfToken,
      user: {
        username: session.username,
        displayName: session.displayName,
        role: require('../domain/profiles').roleCode(session.profile),
        profile: session.profile,
        userSheet: session.userSheet,
      },
    };
  }

  function get(token) {
    if (!token) return null;
    prune();
    const cached = byToken.get(token);
    if (cached) {
      if (cached.expiresAt <= now()) {
        byToken.delete(token);
        return null;
      }
      return cached;
    }
    const payload = decodeToken(token);
    if (!payload || !payload.u || !payload.exp || payload.exp <= now()) {
      return null;
    }
    const session = sessionFromPayload(payload, token);
    byToken.set(token, session);
    return session;
  }

  function destroy(token) {
    if (token) byToken.delete(token);
  }

  return { create, get, destroy, prune };
}

function readBearer(req) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!h || typeof h !== 'string') return '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return '';
}

function readCookie(req, name) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return '';
  const parts = String(raw).split(';');
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    const k = p.slice(0, i).trim();
    if (k === name) return decodeURIComponent(p.slice(i + 1).trim());
  }
  return '';
}

function sessionTokenFromRequest(req) {
  return readBearer(req) || readCookie(req, 'ts3_session') || '';
}

function csrfFromRequest(req) {
  const h = req.headers && (req.headers['x-csrf-token'] || req.headers['X-CSRF-Token']);
  return h ? String(h).trim() : '';
}

module.exports = {
  createSessionStore,
  sessionTokenFromRequest,
  csrfFromRequest,
  readBearer,
  readCookie,
  SESSION_TTL_MS,
};
