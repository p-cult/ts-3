'use strict';

/**
 * Inject planner — pure.
 * Maps parsed rows → projects/users, groups duplicates, applies purge/split.
 * Resolutions: purge (keep one, drop extras) | split | skip.
 * Legacy alias: "merge" → purge.
 */

function normalizeResolution(res) {
  // skip/merge are legacy aliases — UI is purge | split only
  if (res === 'merge' || res === 'skip') return 'purge';
  return res;
}

const { identityKey, normName, guardDuplicate } = require('./identity');
const {
  parseInjectText,
  matchProject,
  matchProjectDetailed,
  matchUser,
  resolveProjectHint,
} = require('./inject-parse');
const { normalizeKind } = require('./kinds');

/** Inject UI "Normal" → domain main; no sub via inject (needs parent). */
function resolveInjectKind(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s || s === 'normal' || s === 'main') return 'main';
  if (s === 'pseudo' || s === 'routine' || s === 'not_a_task') return s;
  const n = normalizeKind(s);
  return n === 'sub' ? 'main' : n;
}

/** Exact identity first; then soft name containment (WhatsApp shorthand vs depot title). */
function findDepotConflict(depot, candidate) {
  const hard = guardDuplicate(depot, candidate);
  if (hard.reason === 'duplicate') return hard;
  const pc = String(candidate.projectCode || '').toUpperCase();
  const who = String(candidate.assigneeUsername || '').toLowerCase();
  const cn = normName(candidate.name);
  if (!cn || !pc) return hard;
  for (const t of depot || []) {
    if (String(t.projectCode || '').toUpperCase() !== pc) continue;
    if (String(t.assigneeUsername || '').toLowerCase() !== who) continue;
    const tn = normName(t.name);
    if (!tn) continue;
    if (tn === cn || tn.indexOf(cn) >= 0 || cn.indexOf(tn) >= 0) {
      return {
        ok: false,
        reason: 'duplicate',
        conflictTaskId: t.taskId || t.id,
        soft: tn !== cn,
      };
    }
  }
  return hard;
}

/** Prefer Done, then under_review, then latest sourceIndex. */
function pickPrimary(members) {
  const rank = (m) => {
    let s = 0;
    if (String(m.status) === 'Done') s += 100;
    if (m.reviewHint === 'under_review') s += 10;
    s += (m.sourceIndex || 0) * 0.001;
    return s;
  };
  return members.slice().sort((a, b) => rank(b) - rank(a))[0] || members[0];
}

function projectFromCodeOrName(codeOrName, projects) {
  if (!codeOrName) return null;
  const byCode = (projects || []).find(
    (p) => String(p.code).toUpperCase() === String(codeOrName).toUpperCase()
  );
  if (byCode) return byCode;
  return matchProjectDetailed(String(codeOrName), projects).project;
}

function resolveProjectForRow(row, projects, overrides, itemCode) {
  // Per-task override wins (admin dropdown on each row)
  if (itemCode) {
    const p = projectFromCodeOrName(itemCode, projects);
    if (p) return { project: p, via: 'override' };
  }
  const hint = String(row.projectHint || '').trim();
  const key = normName(hint);
  const override = overrides && (overrides[hint] || overrides[key]);
  if (override) {
    const p = projectFromCodeOrName(override, projects);
    if (p) return { project: p, via: 'override' };
  }
  const smart = matchProjectDetailed(hint, projects);
  return { project: smart.project, via: smart.via };
}

/** Aggregate paste project hints → master map (smart + strays). */
function buildProjectMap(candidates, projects) {
  const byHint = new Map();
  candidates.forEach((c) => {
    const hint = String(c.projectHint || '').trim() || '(no project)';
    if (!byHint.has(hint)) {
      byHint.set(hint, {
        hint,
        lineCount: 0,
        resolved: false,
        projectCode: '',
        projectName: '',
        via: 'none',
        stray: true,
      });
    }
    const row = byHint.get(hint);
    row.lineCount += 1;
    if (c.projectOk) {
      row.resolved = true;
      row.stray = false;
      row.projectCode = c.projectCode;
      row.projectName = c.projectName;
      row.via = c.projectVia || 'exact';
    }
  });
  const master = (projects || []).map((p) => ({
    code: p.code,
    name: p.name,
  }));
  const entries = [...byHint.values()].sort((a, b) => {
    if (a.stray !== b.stray) return a.stray ? -1 : 1;
    return a.hint.localeCompare(b.hint);
  });
  return {
    master,
    entries,
    smartCount: entries.filter((e) => e.resolved && e.via !== 'override').length,
    overrideCount: entries.filter((e) => e.via === 'override').length,
    strayCount: entries.filter((e) => e.stray).length,
  };
}

/**
 * @param {{
 *   text: string,
 *   projects: object[],
 *   users: object[],
 *   depot: object[],
 *   defaultAssigneeUsername?: string,
 *   resolutions?: Record<string, 'purge'|'split'|'skip'|'merge'>,
 *   projectOverrides?: Record<string, string>,
 *   itemProjectOverrides?: Record<string, string>, // by candidate id "c0" or sourceIndex
 *   itemKindOverrides?: Record<string, string>, // by candidate id → main|pseudo|routine|not_a_task
 * }} input
 */
function planInject(input) {
  const projects = input.projects || [];
  const users = input.users || [];
  const depot = input.depot || [];
  const defaultAssignee = String(input.defaultAssigneeUsername || '').trim();
  const projectOverrides = input.projectOverrides || {};
  const itemProjectOverrides = input.itemProjectOverrides || {};
  const itemKindOverrides = input.itemKindOverrides || {};
  const rawResolutions = input.resolutions || {};
  const resolutions = {};
  Object.keys(rawResolutions).forEach((k) => {
    resolutions[k] = normalizeResolution(rawResolutions[k]);
  });

  const parsed = parseInjectText(input.text || '');
  const candidates = [];

  (parsed.rows || []).forEach((row, i) => {
    const id = 'c' + i;
    const src = row.sourceIndex != null ? row.sourceIndex : i;
    const itemCode =
      itemProjectOverrides[id] ||
      itemProjectOverrides[String(src)] ||
      itemProjectOverrides[String(i)] ||
      '';
    const kindRaw =
      itemKindOverrides[id] ||
      itemKindOverrides[String(src)] ||
      itemKindOverrides[String(i)] ||
      '';
    const kind = resolveInjectKind(kindRaw || 'main');
    const matched = resolveProjectForRow(row, projects, projectOverrides, itemCode);
    const project = matched.project;
    const user =
      matchUser(row.assigneeHint, users) ||
      (defaultAssignee ? matchUser(defaultAssignee, users) : null);
    const assigneeUsername = user
      ? user.username
      : String(row.assigneeHint || defaultAssignee || '').trim().toLowerCase();
    const projectCode = project ? project.code : '';
    const projectName = project ? project.name : String(row.projectHint || '');
    const name = String(row.name || '').trim();
    const key = identityKey({ projectCode, name, assigneeUsername });
    const depotHit = project
      ? findDepotConflict(depot, { projectCode, name, assigneeUsername })
      : { ok: true };

    candidates.push({
      id,
      sourceIndex: src,
      raw: row.raw,
      name,
      projectCode,
      projectName,
      projectHint: row.projectHint || '',
      projectHintResolved: resolveProjectHint(row.projectHint || ''),
      projectVia: matched.via || 'none',
      projectOk: !!project,
      kind,
      assigneeUsername,
      assigneeDisplayName: user ? user.displayName : row.assigneeHint || '',
      assigneeOk: !!user || !assigneeUsername,
      reportPerson: row.reportPerson || row.assigneeHint || '',
      reportDate: row.reportDate || '',
      description: row.description || '',
      notes: row.notes || '',
      status: row.status || 'Active',
      reviewHint: row.reviewHint || 'none',
      completionApproved: !!row.completionApproved,
      link: row.link || '',
      identityKey: key,
      depotDuplicate: depotHit.reason === 'duplicate',
      conflictTaskId: depotHit.conflictTaskId || null,
    });
  });

  // Group by identity within batch (same person + project + cleaned name across days)
  const byKey = new Map();
  candidates.forEach((c) => {
    if (!c.name || !c.projectOk) {
      // Cluster unresolved by hint + name so one remap/decision covers the cluster
      const orphanKey =
        'orphan:' +
        normName(c.projectHint || '') +
        '|' +
        normName(c.name) +
        '|' +
        String(c.assigneeUsername || '').toLowerCase();
      if (!byKey.has(orphanKey)) byKey.set(orphanKey, []);
      byKey.get(orphanKey).push(c);
      return;
    }
    if (!byKey.has(c.identityKey)) byKey.set(c.identityKey, []);
    byKey.get(c.identityKey).push(c);
  });

  const groups = [];
  byKey.forEach((members, key) => {
    const batchDup = members.length > 1;
    const depotDup = members.some((m) => m.depotDuplicate);
    const projectOk = !!(members[0] && members[0].projectOk);
    let defaultRes = 'inject';
    // Strays: held until remapped. Dupes on a master-verified project: purge by default.
    if (!projectOk || !members[0].name) defaultRes = 'purge';
    else if (batchDup || depotDup) defaultRes = 'purge';

    const res = normalizeResolution(resolutions[key] || defaultRes);
    const dates = [...new Set(members.map((m) => m.reportDate).filter(Boolean))];
    groups.push({
      key,
      resolution: res,
      batchDuplicate: batchDup && projectOk,
      depotDuplicate: depotDup,
      crossDay: dates.length > 1,
      conflictTaskId: members.find((m) => m.conflictTaskId)?.conflictTaskId || null,
      members,
      projectCode: members[0].projectCode,
      projectName: members[0].projectName,
      projectHint: members[0].projectHint,
      assigneeUsername: members[0].assigneeUsername,
      assigneeDisplayName: members[0].assigneeDisplayName,
      reportPerson: members[0].reportPerson,
      reportDates: dates,
      name: members[0].name,
      kind: members[0].kind || 'main',
      statusHint: pickPrimary(members).status,
      reviewHint: pickPrimary(members).reviewHint,
    });
  });

  // Unmapped → open dups (split) → ready → purged dups always last
  groups.sort((a, b) => {
    const score = (g) => {
      if (!g.members[0] || !g.members[0].projectOk) return 0;
      const isDup = !!(g.batchDuplicate || g.depotDuplicate);
      if (isDup && g.resolution === 'purge') return 3; // purged → end of list
      if (isDup) return 1; // split / still deciding
      return 2; // ready to inject
    };
    const d = score(a) - score(b);
    if (d) return d;
    const pa = String(a.reportPerson || a.assigneeUsername || '');
    const pb = String(b.reportPerson || b.assigneeUsername || '');
    if (pa !== pb) return pa.localeCompare(pb);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const ready = expandGroups(groups);

  const people = [...new Set(candidates.map((c) => c.reportPerson || c.assigneeUsername).filter(Boolean))];
  const unresolvedHints = [
    ...new Set(candidates.filter((c) => !c.projectOk).map((c) => c.projectHint).filter(Boolean)),
  ];
  const projectMap = buildProjectMap(candidates, projects);

  return {
    format: parsed.format,
    parseWarning: parsed.parseWarning || null,
    candidateCount: candidates.length,
    groupCount: groups.length,
    groups,
    ready,
    people,
    unresolvedProjectHints: unresolvedHints,
    projectMap,
    summary: {
      inject: ready.filter((r) => r.action === 'inject').length,
      // "skip" kept for API compat; UI labels this as purged
      skip: ready.filter((r) => r.action === 'skip').length,
      purged: ready.filter((r) => r.action === 'skip').length,
      unresolvedProject: candidates.filter((c) => !c.projectOk).length,
      batchDuplicates: groups.filter((g) => g.batchDuplicate).length,
      depotDuplicates: groups.filter((g) => g.depotDuplicate).length,
      crossDay: groups.filter((g) => g.crossDay).length,
      people: people.length,
      projectsUnresolved: unresolvedHints.length,
      projectsSmart: projectMap.smartCount,
      projectsOverride: projectMap.overrideCount,
      projectsStray: projectMap.strayCount,
    },
  };
}

/** Apply purge/split → flat inject list (skip is alias of purge). */
function expandGroups(groups) {
  const out = [];
  for (const g of groups) {
    const res = normalizeResolution(g.resolution || 'inject');
    if (!g.members[0].projectOk || !normName(g.members[0].name)) {
      g.members.forEach((m) =>
        out.push({
          ...m,
          action: 'skip',
          reason: !m.projectOk ? 'unresolved_project' : 'empty_name',
          finalName: m.name,
        })
      );
      continue;
    }
    // Already on master sheet: purge = drop all paste lines (do not re-birth)
    if (res === 'purge' && g.depotDuplicate) {
      g.members.forEach((m) =>
        out.push({
          ...m,
          action: 'skip',
          reason: 'purged_already_on_master',
          finalName: m.name,
        })
      );
      continue;
    }
    if (res === 'purge' || (!g.batchDuplicate && res === 'inject')) {
      const primary = pickPrimary(g.members);
      const noteExtra =
        g.members.length > 1
          ? 'Purged ' +
            (g.members.length - 1) +
            ' duplicate line(s); kept one. Dates: ' +
            (g.reportDates || []).join(', ') +
            '. Sources: ' +
            g.members.map((m) => m.raw).join(' | ')
          : '';
      const dayNotes = g.members
        .map((m) => (m.reportDate ? m.reportDate + ': ' + (m.raw || m.name) : ''))
        .filter(Boolean)
        .join('\n');
      out.push({
        ...primary,
        action: 'inject',
        reason: g.batchDuplicate ? 'purged' : 'ok',
        finalName: primary.name,
        notes: [primary.notes, dayNotes, noteExtra].filter(Boolean).join('\n'),
        memberCount: g.members.length,
      });
      g.members
        .filter((m) => m.id !== primary.id)
        .forEach((m) =>
          out.push({
            ...m,
            action: 'skip',
            reason: 'purged_duplicate',
            finalName: primary.name,
          })
        );
      continue;
    }
    if (res === 'split') {
      g.members.forEach((m, i) => {
        const needsSuffix = g.batchDuplicate || g.depotDuplicate;
        const finalName =
          needsSuffix && (g.depotDuplicate || i > 0)
            ? m.name + ' (' + (i + 1) + ')'
            : m.name;
        const nameOut = g.depotDuplicate ? m.name + ' (' + (i + 1) + ')' : finalName;
        out.push({
          ...m,
          action: 'inject',
          reason: 'split',
          finalName: nameOut,
          notes: [m.notes, 'Split duplicate'].filter(Boolean).join('\n'),
        });
      });
    }
  }
  return out;
}

module.exports = {
  planInject,
  expandGroups,
  pickPrimary,
  buildProjectMap,
  resolveInjectKind,
};
