'use strict';

/**
 * Create task — ONLY birth path.
 * Task ID atom = ts-2 format. Client never sees Task ID; gets `ref`.
 *
 * Order: auth → validate → assignee → norm name → identity guard
 *        → nextTaskId → commitBirth → public DTO (ref)
 */

const { canCreate, PROFILE, normalizeProfile } = require('../domain/roles');
const {
  nextTaskId,
  isValidProjectCode,
  employeeSuffix,
  usedSubtasksFor,
} = require('../domain/taskid');
const { guardDuplicate, normName } = require('../domain/identity');
const { toPublicTask } = require('../domain/tasks');
const { normalizeKind, learnKind, isRestrictedKind } = require('../domain/kinds');
const {
  unauthorized,
  forbidden,
  badRequest,
  conflict,
} = require('../errors');

function createCreateTask({ data }) {
  const refSecret = data.refSecret;

  return {
    async execute(input) {
      const actor = input.actor || {};
      const body = input.body || {};
      const profile = normalizeProfile(actor.profile);

      if (!actor.authenticated) throw unauthorized('sign in to create tasks');
      if (!canCreate(profile)) throw forbidden('your role cannot create tasks');

      const projectCode = String(body.projectCode || '').trim().toUpperCase();
      const name = String(body.name || '').trim();
      if (!name) throw badRequest('name is required');
      if (!isValidProjectCode(projectCode)) {
        throw badRequest('project code must be 6 alphanumeric characters');
      }
      const project = data.findProject(projectCode);
      if (!project) throw badRequest('unknown project');

      let assigneeUsername = actor.username;
      if (profile >= PROFILE.SUPER_ADMIN && body.assigneeUsername) {
        assigneeUsername = String(body.assigneeUsername).trim();
      }
      const assignee = data.findUser(assigneeUsername);
      if (!assignee) throw badRequest('assignee user not found');

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

      // Kind / hierarchy (product) — does NOT change Task ID atom structure
      let kind = 'main';
      const learned = learnKind(depotBefore, { projectCode, name }, { normName });
      if (learned) kind = learned;

      let parentTaskId = null;
      // Client sends parentRef (opaque), never Task ID
      const parentKey = body.parentRef || body.parentPublicId;
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

      // Mint AFTER guard only — ts-2 atom
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
      let visibility = 'public';
      if (body.visibility != null && String(body.visibility).trim()) {
        visibility =
          String(body.visibility).trim().toLowerCase() === 'private'
            ? 'private'
            : 'public';
      }
      const link = String(body.link || '').trim();

      const row = {
        taskId,
        projectCode, // denormalized from atom; same value
        projectName: project.name,
        name,
        description: String(body.description || ''),
        notes: String(body.notes || ''),
        status: 'Draft',
        priority: 'normal',
        startDate: String(body.startDate || ''),
        endDate: String(body.endDate || ''),
        assigneeUsername: assignee.username,
        userSheet: assignee.userSheet,
        visibility,
        kind,
        parentTaskId,
        link,
        linkVersion: link ? 1 : 0,
        reviewState: 'none',
        reviewIteration: 0,
        createdAt: now,
        updatedAt: now,
      };

      const saved = data.commitBirth(row);

      const nameMap = new Map(
        data.listUsers().map((u) => [u.username, u.displayName || u.username])
      );
      return {
        task: toPublicTask(saved, nameMap, { profile, refSecret }),
      };
    },
  };
}

module.exports = { createCreateTask };
