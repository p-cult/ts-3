'use strict';

/**
 * Memory adapter — vehicle + depot + mapping.
 * Master key = Task ID atom (13-char). Client address = ref (HMAC), computed outside.
 */

const fs = require('fs');
const path = require('path');
const { validate, parse, usedSubtasksFor, employeeSuffix } = require('../domain/taskid');
const { refFor } = require('../domain/ref');
const { normalizeStatus } = require('../domain/status');

function loadSeed(seedPath) {
  const p = seedPath || path.join(__dirname, 'seed.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createMemoryData(opts = {}) {
  const seed = opts.seed || loadSeed(opts.seedPath);
  const refSecret = opts.refSecret || process.env.SESSION_SECRET || 'dev-ref-secret';

  const users = clone(seed.users || []);
  const projects = clone(seed.projects || []);
  const depot = [];
  const vehicle = Object.create(null);
  const mapping = Object.create(null); // taskId -> { taskId, ref, userSheet, assigneeUsername }
  const byRef = Object.create(null); // ref -> taskId (O(1) reverse lookup)

  function indexMapping(m) {
    if (m && m.ref && m.taskId) byRef[m.ref] = m.taskId;
  }

  function normalizeRow(t) {
    const row = clone(t);
    // Canonical atom field: taskId (also accept legacy id)
    row.taskId = row.taskId || row.id || null;
    delete row.id;
    delete row.publicId; // never a parallel identity
    row.kind = row.kind || 'main';
    row.link = row.link || '';
    row.status = normalizeStatus(row.status || 'Active');
    row.parentTaskId = row.parentTaskId || null;
    row.reviewState = String(row.reviewState || 'none').toLowerCase() || 'none';
    row.linkVersion = Number(row.linkVersion) || 0;
    row.reviewIteration = Number(row.reviewIteration) || 0;
    // Denormalized project from atom when valid
    if (row.taskId && validate(row.taskId)) {
      const p = parse(row.taskId);
      if (p) row.projectCode = p.projectCode;
    }
    return row;
  }

  function ingestTask(t) {
    const row = normalizeRow(t);
    if (!row.taskId || !validate(row.taskId)) return; // skip invalid seed rows
    depot.push(row);
    const sheet = row.userSheet || 'unknown';
    if (!vehicle[sheet]) vehicle[sheet] = [];
    vehicle[sheet].push(clone(row));
    mapping[row.taskId] = {
      taskId: row.taskId,
      ref: refFor(row.taskId, refSecret),
      userSheet: sheet,
      assigneeUsername: row.assigneeUsername,
    };
    indexMapping(mapping[row.taskId]);
  }

  for (const t of seed.tasks || []) ingestTask(t);

  function listDepot() {
    // Shallow copy is enough for list → toPublicTask (never mutates depot rows).
    return depot.map((t) => ({ ...t }));
  }

  function findByTaskId(taskId) {
    const id = String(taskId || '');
    const row = depot.find((t) => t.taskId === id);
    return row ? clone(row) : null;
  }

  function findByRef(ref) {
    const r = String(ref || '').trim();
    if (!r) return null;
    const tid = byRef[r];
    if (tid) {
      const hit = findByTaskId(tid);
      if (hit) return hit;
      // Stale index (hydrate race) — drop and fall through.
      delete byRef[r];
    }
    for (const m of Object.values(mapping)) {
      if (m.ref === r) {
        indexMapping(m);
        const hit = findByTaskId(m.taskId);
        if (hit) return hit;
      }
    }
    // Fallback scan (rare — only if mapping missing)
    for (const t of depot) {
      if (refFor(t.taskId, refSecret) === r) {
        byRef[r] = t.taskId;
        return clone(t);
      }
    }
    return null;
  }

  function allTaskIds() {
    return depot.map((t) => t.taskId);
  }

  function usedSubtasks(projectCode, empSuffix) {
    return usedSubtasksFor(allTaskIds(), projectCode, empSuffix);
  }

  function listUsers() {
    return users.map((u) => clone(u));
  }

  function findUser(username) {
    const want = String(username || '').trim().toLowerCase();
    if (!want) return null;
    const u = users.find(
      (x) => String(x.username || '').trim().toLowerCase() === want
    );
    return u ? clone(u) : null;
  }

  function listProjects() {
    return projects.map(clone);
  }

  function findProject(code) {
    const c = String(code || '').toUpperCase();
    const p = projects.find((x) => String(x.code).toUpperCase() === c);
    return p ? clone(p) : null;
  }

  function commitBirth(row) {
    const r = normalizeRow(row);
    if (!r.taskId || !validate(r.taskId)) {
      throw new Error('commitBirth requires a valid 13-char Task ID');
    }
    if (depot.some((t) => t.taskId === r.taskId)) {
      throw new Error('duplicate birth Task ID');
    }
    depot.push(clone(r));
    const sheet = r.userSheet || 'unknown';
    if (!vehicle[sheet]) vehicle[sheet] = [];
    vehicle[sheet].push(clone(r));
    mapping[r.taskId] = {
      taskId: r.taskId,
      ref: refFor(r.taskId, refSecret),
      userSheet: sheet,
      assigneeUsername: r.assigneeUsername,
    };
    indexMapping(mapping[r.taskId]);
    return clone(r);
  }

  function updateByTaskId(taskId, patch) {
    const id = String(taskId || '');
    const idx = depot.findIndex((t) => t.taskId === id);
    if (idx < 0) return null;
    const prev = depot[idx];
    const next = normalizeRow({ ...prev, ...patch, taskId: prev.taskId });
    depot[idx] = next;
    const sheet = next.userSheet;
    if (vehicle[sheet]) {
      const vi = vehicle[sheet].findIndex((t) => t.taskId === id);
      if (vi >= 0) vehicle[sheet][vi] = clone(next);
    }
    // if userSheet changed, move vehicle row
    if (prev.userSheet !== next.userSheet) {
      if (vehicle[prev.userSheet]) {
        vehicle[prev.userSheet] = vehicle[prev.userSheet].filter((t) => t.taskId !== id);
      }
      if (!vehicle[next.userSheet]) vehicle[next.userSheet] = [];
      if (!vehicle[next.userSheet].some((t) => t.taskId === id)) {
        vehicle[next.userSheet].push(clone(next));
      }
    }
    if (mapping[next.taskId]) {
      mapping[next.taskId] = {
        ...mapping[next.taskId],
        userSheet: next.userSheet,
        assigneeUsername: next.assigneeUsername,
        ref: refFor(next.taskId, refSecret),
      };
      indexMapping(mapping[next.taskId]);
    }
    return clone(next);
  }

  function reassignByTaskId(taskId, assigneeUsername, userSheet) {
    const id = String(taskId || '');
    const idx = depot.findIndex((t) => t.taskId === id);
    if (idx < 0) return null;
    const prev = depot[idx];
    const next = normalizeRow({ ...prev, assigneeUsername, userSheet, taskId: prev.taskId });
    depot[idx] = next;
    if (prev.userSheet !== next.userSheet) {
      if (vehicle[prev.userSheet]) {
        vehicle[prev.userSheet] = vehicle[prev.userSheet].filter((t) => t.taskId !== id);
      }
      if (!vehicle[next.userSheet]) vehicle[next.userSheet] = [];
      if (!vehicle[next.userSheet].some((t) => t.taskId === id)) {
        vehicle[next.userSheet].push(clone(next));
      }
    } else if (vehicle[next.userSheet]) {
      const vi = vehicle[next.userSheet].findIndex((t) => t.taskId === id);
      if (vi >= 0) vehicle[next.userSheet][vi] = clone(next);
    }
    if (mapping[next.taskId]) {
      mapping[next.taskId] = {
        ...mapping[next.taskId],
        userSheet: next.userSheet,
        assigneeUsername: next.assigneeUsername,
      };
    }
    return clone(next);
  }

  function updateByRef(ref, patch) {
    const row = findByRef(ref);
    if (!row) return null;
    return updateByTaskId(row.taskId, patch);
  }

  function deleteByTaskId(taskId) {
    const id = String(taskId || '');
    const idx = depot.findIndex((t) => t.taskId === id);
    if (idx < 0) return false;
    const row = depot[idx];
    depot.splice(idx, 1);
    if (vehicle[row.userSheet]) {
      vehicle[row.userSheet] = vehicle[row.userSheet].filter((t) => t.taskId !== id);
    }
    delete mapping[id];
    for (const r of Object.keys(byRef)) {
      if (byRef[r] === id) delete byRef[r];
    }
    return true;
  }

  function deleteByRef(ref) {
    const row = findByRef(ref);
    if (!row) return false;
    return deleteByTaskId(row.taskId);
  }

  function getMapping(taskId) {
    const m = mapping[taskId];
    return m ? clone(m) : null;
  }

  function partitionsFor(taskId) {
    const m = mapping[taskId];
    if (!m) return null;
    const d = depot.find((t) => t.taskId === taskId);
    const vList = vehicle[m.userSheet] || [];
    const v = vList.find((t) => t.taskId === taskId);
    return {
      mapping: clone(m),
      depot: d ? clone(d) : null,
      vehicle: v ? clone(v) : null,
    };
  }

  return {
    kind: 'memory',
    refSecret,

    async ping() {
      return {
        ok: true,
        kind: 'memory',
        depotCount: depot.length,
        userCount: users.length,
        projectCount: projects.length,
      };
    },

    listDepot,
    findByTaskId,
    findByRef,
    allTaskIds,
    usedSubtasks,
    listUsers,
    findUser,
    listProjects,
    findProject,
    commitBirth,
    updateByTaskId,
    updateByRef,
    reassignByTaskId,
    deleteByTaskId,
    deleteByRef,
    getMapping,
    partitionsFor,
    refFor: (tid) => refFor(tid, refSecret),

    _state: { depot, vehicle, mapping, byRef, users, projects },
  };
}

module.exports = { createMemoryData, loadSeed };
