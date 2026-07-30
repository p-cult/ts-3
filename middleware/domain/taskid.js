'use strict';

/**
 * Task ID engine — matches ts-2 exactly.
 *
 * Format (13 chars):
 *   [ProjectCode: 6 alphanumeric][EmployeeSuffix: last 4 of employee id][Subtask: A01…Z99]
 *
 * Example: PRJ001 + 1001 + A01 = "PRJ0011001A01"
 *   projectCode     = PRJ001
 *   employeeSuffix  = 1001
 *   subtask         = A01  (sequence per user+project, NOT hierarchy kind)
 *
 * Subtask sequence: A01…A99, B01…B99, … Z99. Past Z99 refused.
 * Pure — no I/O. Throws Error with .code on invalid input.
 */

const SUBTASK_RE = /^[A-Z](0[1-9]|[1-9][0-9])$/;
const PROJECT_CODE_RE = /^[A-Za-z0-9]{6}$/;
const EMPLOYEE_SUFFIX_RE = /^.{4}$/;
const TASK_ID_RE = /^[A-Za-z0-9]{6}.{4}[A-Z](0[1-9]|[1-9][0-9])$/;

const SUBTASKS_PER_LETTER = 99;
const MAX_SUBTASK_INDEX = 26 * SUBTASKS_PER_LETTER; // Z99

function idError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function isValidProjectCode(code) {
  return typeof code === 'string' && PROJECT_CODE_RE.test(code);
}

function isValidSubtask(code) {
  return typeof code === 'string' && SUBTASK_RE.test(code);
}

function employeeSuffix(employeeId) {
  if (typeof employeeId !== 'string' || employeeId.length < 4) {
    throw idError('INVALID_EMPLOYEE_ID', 'employee id must be at least 4 characters');
  }
  return employeeId.slice(-4);
}

/** A01 -> 1, A99 -> 99, B01 -> 100, … Z99 -> 2574 */
function indexFromSubtask(code) {
  if (!isValidSubtask(code)) return null;
  const letter = code.charCodeAt(0) - 65;
  const number = parseInt(code.slice(1), 10);
  return letter * SUBTASKS_PER_LETTER + number;
}

/** 1 -> A01, … 2574 -> Z99 */
function subtaskFromIndex(n) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SUBTASK_INDEX) return null;
  const letter = Math.floor((n - 1) / SUBTASKS_PER_LETTER);
  const number = n - letter * SUBTASKS_PER_LETTER;
  return String.fromCharCode(65 + letter) + String(number).padStart(2, '0');
}

function nextSubtask(code) {
  const idx = indexFromSubtask(code);
  if (idx === null) throw idError('INVALID_SUBTASK', `not a valid subtask code: ${code}`);
  return subtaskFromIndex(idx + 1);
}

function compose(parts) {
  const p = parts || {};
  if (!isValidProjectCode(p.projectCode)) {
    throw idError('INVALID_PROJECT_CODE', `project code must be 6 alphanumeric chars: ${p.projectCode}`);
  }
  let suffix;
  if (p.employeeSuffix != null) {
    if (typeof p.employeeSuffix !== 'string' || !EMPLOYEE_SUFFIX_RE.test(p.employeeSuffix)) {
      throw idError('INVALID_EMPLOYEE_SUFFIX', `employee suffix must be exactly 4 chars: ${p.employeeSuffix}`);
    }
    suffix = p.employeeSuffix;
  } else {
    suffix = employeeSuffix(p.employeeId);
  }
  if (!isValidSubtask(p.subtask)) {
    throw idError('INVALID_SUBTASK', `subtask must be A01…Z99: ${p.subtask}`);
  }
  return String(p.projectCode) + suffix + p.subtask;
}

function validate(taskId) {
  return typeof taskId === 'string' && taskId.length === 13 && TASK_ID_RE.test(taskId);
}

function parse(taskId) {
  if (!validate(taskId)) return null;
  return {
    projectCode: taskId.slice(0, 6),
    employeeSuffix: taskId.slice(6, 10),
    subtask: taskId.slice(10, 13),
  };
}

/**
 * nextTaskId({ projectCode, employeeId | employeeSuffix, usedSubtasks })
 * usedSubtasks = array of subtask codes already taken for that user+project.
 */
function nextTaskId(args) {
  const a = args || {};
  const used = Array.isArray(a.usedSubtasks) ? a.usedSubtasks : [];
  let maxIndex = 0;
  for (const code of used) {
    const idx = indexFromSubtask(code);
    if (idx !== null && idx > maxIndex) maxIndex = idx;
  }
  const nextSub = subtaskFromIndex(maxIndex + 1);
  if (nextSub === null) {
    throw idError(
      'SUBTASK_OVERFLOW',
      'subtask sequence exhausted at Z99; refusing to generate an invalid Task ID'
    );
  }
  return compose({
    projectCode: a.projectCode,
    employeeId: a.employeeId,
    employeeSuffix: a.employeeSuffix,
    subtask: nextSub,
  });
}

function usedSubtasksFor(taskIds, projectCode, empSuffix) {
  const out = [];
  for (const id of taskIds || []) {
    const p = parse(id);
    if (p && p.projectCode === projectCode && p.employeeSuffix === empSuffix) {
      out.push(p.subtask);
    }
  }
  return out;
}

module.exports = {
  isValidProjectCode,
  isValidSubtask,
  employeeSuffix,
  indexFromSubtask,
  subtaskFromIndex,
  nextSubtask,
  compose,
  parse,
  validate,
  nextTaskId,
  usedSubtasksFor,
  MAX_SUBTASK_INDEX,
  TASK_ID_RE,
};
