'use strict';

const { PROFILE, normalizeProfile } = require('../domain/roles');
const { planInject } = require('../domain/inject-plan');
const { unauthorized, forbidden, badRequest } = require('../errors');
const { refFor } = require('../domain/ref');

function createPreviewInject({ data }) {
  const refSecret = data.refSecret;
  return {
    async execute({ actor, body }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (normalizeProfile(actor.profile) < PROFILE.SUPER_ADMIN) {
        throw forbidden('only admin (P4) can use task injection');
      }
      const text = body && body.text != null ? String(body.text) : '';
      if (!text.trim()) throw badRequest('text is required');

      const plan = planInject({
        text,
        projects: data.listProjects(),
        users: data.listUsers(),
        depot: data.listDepot(),
        defaultAssigneeUsername: String((body && body.defaultAssigneeUsername) || '').trim(),
        resolutions: (body && body.resolutions) || {},
        projectOverrides: (body && body.projectOverrides) || {},
        itemProjectOverrides: (body && body.itemProjectOverrides) || {},
        itemKindOverrides: (body && body.itemKindOverrides) || {},
      });

      // Attach public refs for depot conflicts
      plan.groups.forEach((g) => {
        if (g.conflictTaskId) {
          g.conflictRef = refFor(g.conflictTaskId, refSecret);
        }
      });
      plan.ready.forEach((r) => {
        if (r.conflictTaskId) {
          r.conflictRef = refFor(r.conflictTaskId, refSecret);
        }
      });

      return plan;
    },
  };
}

module.exports = { createPreviewInject };
