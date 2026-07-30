'use strict';

const { scopeTasks } = require('../domain/tasks');
const { normalizeKind, kindIcon } = require('../domain/kinds');
const { unauthorized } = require('../errors');
const { PROFILE, normalizeProfile } = require('../domain/profiles');

function createListLogs({ data }) {
  return {
    async execute({ actor, query }) {
      if (!actor || !actor.authenticated) {
        throw unauthorized('sign in to view logs');
      }
      const profile = normalizeProfile(actor.profile);
      if (profile < PROFILE.USER) throw unauthorized('sign in to view logs');

      const q = query || {};
      let rows = scopeTasks(data.listDepot(), actor);

      if (q.kind) {
        const k = String(q.kind).toLowerCase();
        rows = rows.filter((t) => normalizeKind(t.kind) === k);
      }
      if (q.status) {
        rows = rows.filter((t) => t.status === q.status);
      }
      if (q.assignee) {
        rows = rows.filter((t) => t.assigneeUsername === q.assignee);
      }
      if (q.projectCode) {
        const pc = String(q.projectCode).toUpperCase();
        rows = rows.filter((t) => String(t.projectCode).toUpperCase() === pc);
      }
      if (q.reviewState) {
        rows = rows.filter(
          (t) => String(t.reviewState || 'none') === String(q.reviewState)
        );
      }
      if (q.q) {
        const s = String(q.q).toLowerCase();
        rows = rows.filter(
          (t) =>
            String(t.name).toLowerCase().includes(s) ||
            String(t.notes).toLowerCase().includes(s)
        );
      }

      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );

      const entries = rows.map((t) => {
        const stages = data.getStages(t.taskId);
        const reviews = data.getReviews(t.taskId);
        return {
          ref: data.refFor(t.taskId),
          name: t.name,
          projectCode: t.projectCode,
          projectName: t.projectName,
          assigneeUsername: t.assigneeUsername,
          assigneeDisplayName: nameMap.get(t.assigneeUsername) || t.assigneeUsername,
          status: t.status,
          kind: profile >= PROFILE.SUPER_ADMIN ? normalizeKind(t.kind) : undefined,
          kindIcon: profile >= PROFILE.SUPER_ADMIN ? kindIcon(t.kind) : '',
          visibility: t.visibility,
          link: t.link || '',
          hasLink: !!(t.link && String(t.link).trim()),
          reviewState: t.reviewState === 'sent_back' ? 'rework' : (t.reviewState || 'none'),
          linkVersion: t.linkVersion || 0,
          reviewIteration: Number(t.reviewIteration) || 0,
          stagesSummary: stages
            ? stages.currentIndex + '/' + (stages.tokens || []).length
            : '',
          stagesTokens: stages ? stages.tokens : [],
          reviewCount: reviews.length,
          lastReview: reviews.length ? reviews[reviews.length - 1] : null,
          updatedAt: t.updatedAt,
        };
      });

      return { logs: entries };
    },
  };
}

module.exports = { createListLogs };
