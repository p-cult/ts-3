'use strict';

const profiles = require('./profiles');
const awareness = require('./awareness');
const roles = require('./roles');
const taskid = require('./taskid');
const identity = require('./identity');
const tasks = require('./tasks');
const kinds = require('./kinds');
const stages = require('./stages');
const review = require('./review');

module.exports = {
  profiles,
  awareness,
  roles,
  taskid,
  identity,
  tasks,
  kinds,
  stages,
  review,
  PROFILE: profiles.PROFILE,
  roleCode: profiles.roleCode,
  roleName: profiles.roleName,
  normalizeProfile: profiles.normalizeProfile,
  evaluateOverall: awareness.evaluateOverall,
  LEVEL: awareness.LEVEL,
  permissionsFor: roles.permissionsFor,
  authorizeTaskPatch: roles.authorizeTaskPatch,
  normName: identity.normName,
  guardDuplicate: identity.guardDuplicate,
};
