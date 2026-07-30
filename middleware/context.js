'use strict';

/**
 * Request context — one object per request.
 * Delivery detail (outer) that carries pointers into use-cases + data.
 * Does not contain business rules.
 */

const { sendJson, readJson } = require('./http');
const { PROFILE, roleCode } = require('./domain/profiles');

function anonymousActor() {
  return Object.freeze({
    authenticated: false,
    profile: PROFILE.PUBLIC,
    role: roleCode(PROFILE.PUBLIC),
    username: null,
    displayName: null,
    userSheet: null,
    user: null,
  });
}

/** Baseline flags — full matrix lives in domain/roles later (Slice 01). */
function permissionsForAnonymous() {
  return Object.freeze({
    profile: PROFILE.PUBLIC,
    role: roleCode(PROFILE.PUBLIC),
    canCreate: false,
    canEdit: false,
    editScope: 'none',
    canClassify: false,
    canSetPriority: false,
    canViewReports: false,
    canAdmin: false,
    canViewAll: true,
    canWrite: false,
    createsDirect: false,
  });
}

/**
 * @param {object} args
 */
function createContext(args) {
  const {
    req,
    res,
    config,
    useCases,
    data,
    log,
    requestId,
    pathname,
    query,
  } = args;

  const ctx = {
    req,
    res,
    config,
    /** @deprecated use useCases — kept during rename for one cycle if needed */
    useCases,
    services: useCases,
    data,
    log,
    requestId,
    pathname,
    query: query || Object.create(null),
    params: Object.create(null),

    actor: anonymousActor(),
    permissions: permissionsForAnonymous(),

    sendJson(status, body, headers) {
      return sendJson(res, status, body, headers);
    },
    readJson(opts) {
      return readJson(req, opts);
    },

    setActor(actor, permissions) {
      ctx.actor = actor && typeof actor === 'object' ? actor : anonymousActor();
      ctx.permissions =
        permissions && typeof permissions === 'object'
          ? permissions
          : permissionsForAnonymous();
    },
  };

  return ctx;
}

module.exports = {
  createContext,
  anonymousActor,
  permissionsForAnonymous,
};
