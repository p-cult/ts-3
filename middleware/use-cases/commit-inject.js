'use strict';

/**
 * Commit inject — loops the ONLY birth hallway (createTask).
 * Sheets push follows existing commitBirth → bridge when live writes enabled.
 */

const { PROFILE, normalizeProfile } = require('../domain/roles');
const { planInject } = require('../domain/inject-plan');
const { ensureTaskApprovedMark } = require('../data/sheet-row');
const { unauthorized, forbidden, badRequest } = require('../errors');

function createCommitInject({ data, useCases }) {
  return {
    async execute({ actor, body }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (normalizeProfile(actor.profile) < PROFILE.SUPER_ADMIN) {
        throw forbidden('only admin (P4) can inject tasks');
      }

      let ready = Array.isArray(body && body.items) ? body.items : null;

      // Prefer server-side re-plan from text + resolutions (authoritative)
      if (body && body.text) {
        const plan = planInject({
          text: String(body.text),
          projects: data.listProjects(),
          users: data.listUsers(),
          depot: data.listDepot(),
          defaultAssigneeUsername: String(body.defaultAssigneeUsername || '').trim(),
          resolutions: body.resolutions || {},
          projectOverrides: body.projectOverrides || {},
          itemProjectOverrides: body.itemProjectOverrides || {},
          itemKindOverrides: body.itemKindOverrides || {},
        });
        ready = plan.ready;
      }

      if (!ready || !ready.length) throw badRequest('nothing to inject');

      const results = [];
      for (const item of ready) {
        if (item.action !== 'inject') {
          results.push({
            ok: false,
            skipped: true,
            reason: item.reason || 'skipped',
            name: item.finalName || item.name,
            projectCode: item.projectCode,
          });
          continue;
        }
        try {
          const birthActor = {
            authenticated: true,
            profile: PROFILE.SUPER_ADMIN,
            username: actor.username,
            displayName: actor.displayName,
          };
          const birth = await useCases.createTask.execute({
            actor: birthActor,
            body: {
              projectCode: item.projectCode,
              name: item.finalName || item.name,
              description: item.description || '',
              notes: item.notes || '',
              link: item.link || '',
              assigneeUsername: item.assigneeUsername,
              kind: item.kind || 'main',
            },
          });
          let task = birth.task;
          // Birth always starts Active; optional follow-up status for paste hints like "done"
          if (task && task.ref && String(item.status || '') === 'Done' && useCases.updateTask) {
            try {
              const patchBody = { status: 'Done' };
              if (item.completionApproved) {
                patchBody.notes = ensureTaskApprovedMark(item.notes || '');
              }
              const patched = await useCases.updateTask.execute({
                actor: birthActor,
                id: task.ref,
                body: patchBody,
              });
              if (patched && patched.task) task = patched.task;
            } catch (_) {
              /* keep Active if Done gate refuses (e.g. ratings) */
            }
          }
          results.push({
            ok: true,
            name: item.finalName || item.name,
            projectCode: item.projectCode,
            assigneeUsername: item.assigneeUsername,
            ref: task && task.ref,
            task,
          });
        } catch (err) {
          results.push({
            ok: false,
            name: item.finalName || item.name,
            projectCode: item.projectCode,
            error: String(err && err.message ? err.message : err),
            code: err && err.code,
          });
        }
      }

      return {
        ok: results.every((r) => r.ok || r.skipped),
        injected: results.filter((r) => r.ok).length,
        skipped: results.filter((r) => r.skipped).length,
        failed: results.filter((r) => !r.ok && !r.skipped).length,
        results,
        note:
          'Birth goes through middleware mint → vehicle → depot → mapping; live Sheets follow when STAGING_WRITES + bridge are on.',
      };
    },
  };
}

module.exports = { createCommitInject };
