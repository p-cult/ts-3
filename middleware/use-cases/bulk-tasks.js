'use strict';

const { normalizeKind } = require('../domain/kinds');
const { PROFILE, normalizeProfile } = require('../domain/profiles');
const { unauthorized, forbidden, badRequest } = require('../errors');

function createBulkTasks({ data }) {
  return {
    async execute({ actor, body }) {
      if (!actor || !actor.authenticated) throw unauthorized('sign in required');
      if (normalizeProfile(actor.profile) < PROFILE.SUPER_ADMIN) {
        throw forbidden('admin only');
      }
      // ids = client refs
      const ids = Array.isArray(body && body.ids) ? body.ids : [];
      if (!ids.length) throw badRequest('ids required');
      const action = String((body && body.action) || '').toLowerCase();
      const results = [];

      for (const id of ids) {
        const row = data.findByRef(String(id));
        if (!row) {
          results.push({ id, ok: false, error: 'not found' });
          continue;
        }
        try {
          if (action === 'delete') {
            data.deleteByTaskId(row.taskId);
            results.push({ id, ok: true, action: 'delete' });
          } else if (action === 'set_kind') {
            const kind = normalizeKind(body.kind);
            const patch = { kind, updatedAt: new Date().toISOString() };
            if (kind !== 'sub') patch.parentTaskId = null;
            await Promise.resolve(data.updateByTaskId(row.taskId, patch));
            results.push({ id, ok: true, action: 'set_kind', kind });
          } else if (action === 'set_status') {
            const newStatus = String(body.status || row.status);
            const { coerceApiStatus } = require('../domain/status');
            const status = coerceApiStatus(newStatus);
            if (!status) {
              results.push({ id, ok: false, error: 'status not allowed' });
              continue;
            }
            await Promise.resolve(
              data.updateByTaskId(row.taskId, {
                status,
                updatedAt: new Date().toISOString(),
              })
            );
            results.push({ id, ok: true, action: 'set_status' });
          } else {
            results.push({ id, ok: false, error: 'unknown action' });
          }
        } catch (e) {
          results.push({ id, ok: false, error: String(e.message || e) });
        }
      }
      return { results };
    },
  };
}

module.exports = { createBulkTasks };
