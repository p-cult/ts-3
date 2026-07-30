'use strict';

/**
 * domain/ — innermost circle (Clean Architecture).
 *
 * Holds pure business concepts and rules.
 * Depends on: nothing in this app (no data/, no adapters/, no http).
 *
 * Slice 01+ will add: taskid, identity, birth rules, roles gates, entities.
 * Outer layers import domain — domain never imports outer layers.
 */

const profiles = require('./profiles');
const awareness = require('./awareness');

module.exports = {
  profiles,
  awareness,
  PROFILE: profiles.PROFILE,
  roleCode: profiles.roleCode,
  roleName: profiles.roleName,
  normalizeProfile: profiles.normalizeProfile,
  evaluateOverall: awareness.evaluateOverall,
  LEVEL: awareness.LEVEL,
};
