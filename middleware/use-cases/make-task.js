'use strict';

const { createUpdateTask } = require('./update-task');

/** Promote routine/pseudo/not_a_task → main (clear classifier). Reuses PATCH gate. */
function createMakeTask({ data }) {
  const updateTask = createUpdateTask({ data });
  return {
    async execute({ actor, id }) {
      return updateTask.execute({ actor, id, body: { kind: 'main' } });
    },
  };
}

module.exports = { createMakeTask };
