'use strict';

const { parseStageTokens, clampIndex } = require('../domain/stages');
const { isStageable, normalizeKind } = require('../domain/kinds');
const { canViewTask } = require('../domain/tasks');
const { PROFILE, normalizeProfile } = require('../domain/profiles');
const {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
} = require('../errors');

function createSetStages({ data }) {
  return {
    async execute({ actor, id, body }) {
      if (!actor || !actor.authenticated) {
        throw unauthorized('sign in required');
      }
      const row = data.findByRef(id);
      if (!row) throw notFound('task not found');
      const view = canViewTask(row, actor);
      if (view !== 'ok') throw forbidden('not allowed');

      const profile = normalizeProfile(actor.profile);
      const owns = row.assigneeUsername === actor.username;
      if (profile < PROFILE.SUPER_ADMIN && !owns) {
        throw forbidden('only owner or admin can set stages');
      }

      if (!isStageable(row.kind)) {
        throw badRequest('stages only allowed on main or sub tasks');
      }

      const parsed = parseStageTokens(
        body && (body.tokens != null ? body.tokens : body.text)
      );
      if (!parsed.ok) throw badRequest(parsed.error);

      const currentIndex = clampIndex(
        parsed.tokens,
        body && body.currentIndex != null ? body.currentIndex : 0
      );

      // Side store only — keyed by internal taskId, never commitBirth
      const stages = data.setStages(row.taskId, {
        tokens: parsed.tokens,
        currentIndex,
      });

      return {
        ok: true,
        stages: {
          tokens: stages.tokens,
          currentIndex: stages.currentIndex,
          total: stages.tokens.length,
          ratio: stages.tokens.length
            ? stages.currentIndex / stages.tokens.length
            : 0,
        },
      };
    },
  };
}

module.exports = { createSetStages };
