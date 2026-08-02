'use strict';

const { scopeTasks } = require('../domain/tasks');
const { normalizeKind, kindIcon } = require('../domain/kinds');
const { joinVisibleAndHistory } = require('../domain/field-class');
const { unauthorized } = require('../errors');
const { PROFILE, normalizeProfile } = require('../domain/profiles');
const { statusMatchesFilter } = require('../domain/status');

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
        rows = rows.filter((t) => statusMatchesFilter(t.status, q.status));
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
        const joined = joinVisibleAndHistory(t, {
          stages: data.getStages(t.taskId),
          reviews: data.getReviews(t.taskId),
        });
        return {
          ref: data.refFor(t.taskId),
          name: joined.name,
          projectCode: joined.projectCode,
          projectName: joined.projectName,
          assigneeUsername: joined.assigneeUsername,
          assigneeDisplayName: nameMap.get(joined.assigneeUsername) || joined.assigneeUsername,
          status: joined.status,
          kind: profile >= PROFILE.SUPER_ADMIN ? normalizeKind(joined.kind) : undefined,
          kindIcon: profile >= PROFILE.SUPER_ADMIN ? kindIcon(joined.kind) : '',
          link: joined.link || '',
          hasLink: !!(joined.link && String(joined.link).trim()),
          reviewState: joined.reviewState || 'none',
          linkVersion: joined.linkVersion || 0,
          reviewIteration: Number(joined.reviewIteration) || 0,
          stagesSummary: joined.stagesSummary,
          stagesTokens: joined.stagesTokens,
          reviewCount: joined.reviewCount,
          lastReview: joined.lastReview,
          updatedAt: joined.updatedAt,
        };
      });

      return { logs: entries };
    },
  };
}

module.exports = { createListLogs };
