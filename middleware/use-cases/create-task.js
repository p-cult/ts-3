'use strict';

/**
 * Create task — ONLY birth path.
 * Task ID atom = ts-2 format. Client never sees Task ID; gets `ref`.
 *
 * Order: auth → validate → assignee → norm name → identity guard
 *        → nextTaskId → commitBirth → public DTO (ref)
 *
 * When QUEUE_MODE=on and actor is P2: enqueue draft (no mint) instead.
 */

const { canCreate, mustQueueCreates, PROFILE, normalizeProfile } = require('../domain/roles');
const {
  nextTaskId,
  isValidProjectCode,
  employeeSuffix,
  usedSubtasksFor,
} = require('../domain/taskid');
const { guardDuplicate, normName } = require('../domain/identity');
const { toPublicTask } = require('../domain/tasks');
const { applyAll } = require('../priority');
const { normalizeKind, learnKind } = require('../domain/kinds');
const {
  unauthorized,
  forbidden,
  badRequest,
  conflict,
} = require('../errors');
const {
  canonicalUserSheet,
  isVinodIdentity,
} = require('../domain/user-sheet');

function createCreateTask({ data, config }) {
  const refSecret = data.refSecret;
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

      if (!input._fromQueue && queueOn() && mustQueueCreates(profile, true)) {
        const { createEnqueueDraft } = require('./enqueue-draft');
        return createEnqueueDraft({ data, config }).execute(input);
      }

      const projectCode = String(body.projectCode || '').trim().toUpperCase();
      const name = String(body.name || '').trim();
      if (!name) throw badRequest('name is required');
      if (!isValidProjectCode(projectCode)) {
        throw badRequest('project code must be 6 alphanumeric characters');
      }
      const project = data.findProject(projectCode);
      if (!project) throw badRequest('unknown project');

      let assigneeUsername = actor.username;
      // Vinod creates as himself; other admins may pick an assignee.
      if (isVinodIdentity(actor)) {
        assigneeUsername = actor.username;
      } else if (profile >= PROFILE.SUPER_ADMIN && body.assigneeUsername) {
        assigneeUsername = String(body.assigneeUsername).trim();
      }
      const assignee = data.findUser(assigneeUsername);
      if (!assignee) throw badRequest('assignee user not found');
      const userSheet =
        canonicalUserSheet({ ...assignee, assigneeUsername: assignee.username })
        || String(assignee.userSheet || '').trim();
      if (!userSheet) throw badRequest('assignee has no users-tab key (userSheet)');

      void normName(name);

      const depotBefore = data.listDepot();
      const allIds = data.allTaskIds().slice();
      const dup = guardDuplicate(depotBefore, {
        projectCode,
        name,
        assigneeUsername: assignee.username,
      });
      if (!dup.ok) {
        throw conflict(
          'a task with this project, name, and assignee already exists',
          {
            conflictRef: dup.conflictTaskId
              ? data.refFor(dup.conflictTaskId)
              : undefined,
          }
        );
      }

      let kind = 'main';
      const learned = learnKind(depotBefore, { projectCode, name }, { normName });
      if (learned) kind = learned;

      let parentTaskId = null;
      const parentKey = body.parentRef;
      if (parentKey) {
        const parent = data.findByRef(String(parentKey));
        if (!parent) throw badRequest('parent task not found');
        parentTaskId = parent.taskId;
        kind = 'sub';
      }

      if (profile >= PROFILE.SUPER_ADMIN && body.kind != null && body.kind !== '') {
        kind = normalizeKind(body.kind);
        if (kind !== 'sub') parentTaskId = null;
      }
      if (kind === 'sub' && !parentTaskId) {
        throw badRequest('sub tasks require a parent Main (parentRef)');
      }

      let empSuf;
      try {
        empSuf = employeeSuffix(String(assignee.employeeId));
      } catch (e) {
        throw badRequest(e.message || 'invalid employee id');
      }
      const usedSubs = usedSubtasksFor(allIds, projectCode, empSuf);
      let taskId;
      try {
        taskId = nextTaskId({
          projectCode,
          employeeSuffix: empSuf,
          usedSubtasks: usedSubs,
        });
      } catch (e) {
        if (e && e.code === 'SUBTASK_OVERFLOW') {
          throw badRequest(e.message);
        }
        throw badRequest(e.message || 'could not mint Task ID');
      }

      const now = new Date().toISOString();
      const link = String(body.link || '').trim();

      if (Array.isArray(body.links) && body.links.length > 4) {
        throw badRequest('maximum 4 links allowed');
      }
      if (Array.isArray(body.ratings) && body.ratings.length > 4) {
        throw badRequest('maximum 4 links allowed');
      }

      const row = {
        taskId,
        projectCode,
        projectName: project.name,
        name,
        description: String(body.description || ''),
        notes: String(body.notes || ''),
        status: 'Active',
        priority: 'normal',
        startDate: String(body.startDate || ''),
        endDate: String(body.endDate || ''),
        assigneeUsername: assignee.username,
        userSheet,
        kind,
        parentTaskId,
        link,
        linkVersion: link ? 1 : 0,
        reviewState: 'none',
        reviewIteration: 0,
        createdAt: now,
        updatedAt: now,
      };

      const saved = await Promise.resolve(data.commitBirth(row));

      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );
      const task = toPublicTask(saved, nameMap, { profile, refSecret });
      if (task) {
        applyAll([task]);
        task.syncStatus =
          saved.syncStatus ||
          (data.syncStatusForTask && data.syncStatusForTask(saved.taskId)) ||
          'synced';
      }
      return { task };
    },
  };
}

module.exports = { createCreateTask };
