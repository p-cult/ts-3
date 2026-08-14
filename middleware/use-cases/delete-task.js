'use strict';

const { canDelete, normalizeProfile } = require('../domain/roles');
const { unauthorized, forbidden, notFound } = require('../errors');

function createDeleteTask({ data }) {
  return {
    async execute({ actor, id }) {
      if (!actor || !actor.authenticated) {
        throw unauthorized('sign in to delete tasks');
      }
      if (!canDelete(actor.profile)) {
        throw forbidden('only admin can delete tasks');
      }
      const row = data.findByRef(id);
      if (!row) throw notFound('task not found');
      const ok = await Promise.resolve(data.deleteByRef(id));
      if (!ok) throw notFound('task not found');
      return { ok: true };
    },
  };
}

module.exports = { createDeleteTask };
