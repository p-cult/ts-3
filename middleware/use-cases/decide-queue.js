'use strict';

/**
 * Approve queue item → one birth hallway (identity guard → mint → commitBirth).
 * Reject → discard. Never mints on reject.
 */

const { PROFILE, normalizeProfile } = require('../domain/roles');
const { unauthorized, forbidden, notFound, badRequest } = require('../errors');

function createDecideQueue({ data, useCases }) {
  return {
    async list({ actor }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in');
      if (normalizeProfile(actor.profile) < PROFILE.MODERATOR) {
        throw forbidden('only P3/P4 can view the queue');
      }
      return { queue: data.listQueue({ status: 'pending' }) };
    },

    async approve({ actor, queueId }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in');
      if (normalizeProfile(actor.profile) < PROFILE.MODERATOR) {
        throw forbidden('only P3/P4 can approve queue items');
      }
      const item = data.getQueueItem(queueId);
      if (!item || item.status !== 'pending') throw notFound('queue item not found');
      const d = item.draft || {};
      if (!d.name || !d.projectCode) throw badRequest('queue draft incomplete');

      // Re-enter the ONLY create/birth path as admin actor (still identity guard + mint inside)
      const birthActor = {
        authenticated: true,
        profile: PROFILE.SUPER_ADMIN,
        username: d.assigneeUsername || actor.username,
        displayName: actor.displayName,
      };
      const result = await useCases.createTask.execute({
        actor: {
          ...birthActor,
          // create-task uses actor as assignee unless P4 sets assigneeUsername
          profile: PROFILE.SUPER_ADMIN,
          username: actor.username,
        },
        body: {
          projectCode: d.projectCode,
          name: d.name,
          description: d.description || '',
          notes: d.notes || '',
          startDate: d.startDate || '',
          endDate: d.endDate || '',
          link: d.link || '',
          assigneeUsername: d.assigneeUsername,
        },
        _fromQueue: true,
      });

      data.markQueueItem(queueId, 'approved', {
        decidedBy: actor.username,
        birthRef: result.task && result.task.ref,
      });
      return { approved: true, task: result.task, queueId };
    },

    async reject({ actor, queueId, reason }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in');
      if (normalizeProfile(actor.profile) < PROFILE.MODERATOR) {
        throw forbidden('only P3/P4 can reject queue items');
      }
      const item = data.getQueueItem(queueId);
      if (!item || item.status !== 'pending') throw notFound('queue item not found');
      data.markQueueItem(queueId, 'rejected', {
        decidedBy: actor.username,
        reason: String(reason || ''),
      });
      return { rejected: true, queueId };
    },
  };
}

module.exports = { createDecideQueue };
