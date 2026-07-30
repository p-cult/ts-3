'use strict';

/**
 * In-memory sessions for Slice 01.
 * Token works as Bearer and optional cookie value.
 */

const crypto = require('crypto');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function createSessionStore() {
  /** @type {Map<string, object>} */
  const byToken = new Map();

  function now() {
    return Date.now();
  }

  function prune() {
    const t = now();
    for (const [tok, s] of byToken.entries()) {
      if (!s || s.expiresAt <= t) byToken.delete(tok);
    }
  }

  function create(user) {
    prune();
    const token = crypto.randomBytes(24).toString('base64url');
    const csrfToken = crypto.randomBytes(16).toString('base64url');
    const session = {
      token,
      csrfToken,
      username: user.username,
      displayName: user.displayName,
      profile: user.profile,
      userSheet: user.userSheet,
      employeeId: user.employeeId,
      createdAt: now(),
      expiresAt: now() + SESSION_TTL_MS,
    };
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
    const s = byToken.get(token);
    if (!s) return null;
    if (s.expiresAt <= now()) {
      byToken.delete(token);
      return null;
    }
    return s;
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
