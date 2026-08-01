'use strict';

/**
 * Enqueue create draft — NO Task ID. Queue mode only.
 */

const { canCreate, mustQueueCreates, PROFILE, normalizeProfile } = require('../domain/roles');
const { isValidProjectCode } = require('../domain/taskid');
const { unauthorized, forbidden, badRequest } = require('../errors');

function createEnqueueDraft({ data, config }) {
  const queueOn = () => {
    const m = String((config && config.queueMode) || 'off').toLowerCase();
    return m === 'on' || m === 'true' || m === '1';
  };

  return {
    async execute(input) {
      const actor = input.actor || {};
      const body = input.body || {};
      const profile = normalizeProfile(actor.profile);

      if (!actor.authenticated) throw unauthorized('sign in to create tasks');
      if (!canCreate(profile)) throw forbidden('your role cannot create tasks');
      if (!queueOn() || !mustQueueCreates(profile, true)) {
        throw badRequest('queue mode is off for this create path');
      }

      const projectCode = String(body.projectCode || '').trim().toUpperCase();
      const name = String(body.name || '').trim();
      if (!name) throw badRequest('name is required');
      if (!isValidProjectCode(projectCode)) {
        throw badRequest('project code must be 6 alphanumeric characters');
      }
      const project = data.findProject(projectCode);
      if (!project) throw badRequest('unknown project');

      const draft = {
        projectCode,
        projectName: project.name,
        name,
        description: String(body.description || ''),
        notes: String(body.notes || ''),
        startDate: String(body.startDate || ''),
        endDate: String(body.endDate || ''),
        link: String(body.link || '').trim(),
        assigneeUsername: actor.username,
        submittedBy: actor.username,
        // no taskId
      };

      const item = data.enqueueDraft(draft);
      return {
        queued: true,
        queueId: item.queueId,
        message: 'Draft queued — waiting for P3/P4 approve (no Task ID yet)',
        item: {
          queueId: item.queueId,
          status: item.status,
          createdAt: item.createdAt,
          draft: {
            projectCode: draft.projectCode,
            name: draft.name,
            assigneeUsername: draft.assigneeUsername,
          },
        },
      };
    },
  };
}

module.exports = { createEnqueueDraft };
