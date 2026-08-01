'use strict';

const { createGetHealth } = require('./get-health');
const { createLogin } = require('./login');
const { createLogout } = require('./logout');
const { createGetMe } = require('./get-me');
const { createListTasks } = require('./list-tasks');
const { createGetTask } = require('./get-task');
const { createCreateTask } = require('./create-task');
const { createUpdateTask } = require('./update-task');
const { createDeleteTask } = require('./delete-task');
const { createListProjects } = require('./list-projects');
const { createSetStages } = require('./set-stages');
const { createReviewTask } = require('./review-task');
const { createListLogs } = require('./list-logs');
const { createBulkTasks } = require('./bulk-tasks');
const { createReassignTask } = require('./reassign-task');
const { createListUsers } = require('./list-users');
const { createDecideQueue } = require('./decide-queue');
const { createMakeTask } = require('./make-task');
const { createGetDropdownData } = require('./get-dropdown-data');

function createUseCases(deps) {
  const { config, data, runtime, sessions, log } = deps;
  const review = createReviewTask({ data });
  const createTask = createCreateTask({ data, config });
  const decideQueue = createDecideQueue({
    data,
    useCases: { createTask },
  });

  return {
    getHealth: createGetHealth({ config, data, runtime, log }),
    login: createLogin({ data, sessions }),
    logout: createLogout({ sessions }),
    getMe: createGetMe(),
    listTasks: createListTasks({ data }),
    getTask: createGetTask({ data }),
    createTask,
    updateTask: createUpdateTask({ data }),
    deleteTask: createDeleteTask({ data }),
    listProjects: createListProjects({ data }),
    listUsers: createListUsers({ data }),
    setStages: createSetStages({ data }),
    reviewSubmit: { execute: (i) => review.submit(i) },
    reviewFeedback: { execute: (i) => review.feedback(i) },
    reviewRework: { execute: (i) => review.rework(i) },
    reviewApprove: { execute: (i) => review.approve(i) },
    listLogs: createListLogs({ data }),
    bulkTasks: createBulkTasks({ data }),
    reassignTask: createReassignTask({ data }),
    listQueue: { execute: (i) => decideQueue.list(i) },
    approveQueue: { execute: (i) => decideQueue.approve(i) },
    rejectQueue: { execute: (i) => decideQueue.reject(i) },
    makeTask: createMakeTask({ data }),
    getDropdownData: createGetDropdownData({ data }),
  };
}

module.exports = { createUseCases };
