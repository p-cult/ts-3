'use strict';

/**
 * Bulk inject text parser — pure.
 * Accepts WhatsApp-style paste, JSON, CSV, TSV → raw line candidates.
 * Tuned for multi-person / multi-day Param status dumps.
 */

const { normName } = require('./identity');

/**
 * Paste aliases → master ProjectCode (admin Projects / admin tab).
 * Never invent codes — only map informal WA labels onto existing master rows.
 */
const PROJECT_ALIASES = Object.freeze({
  edits: 'CEDT00',
  'edits+': 'CEDT00',
  'cult edits': 'CEDT00',
  'cult edits+': 'CEDT00',
  'cult edit': 'CEDT00',
  'cult edits +': 'CEDT00',
  cedt: 'CEDT00',
  socmed: 'PCSM00',
  'social media': 'PCSM00',
  media: 'PCSM00',
  others: 'OTHR01',
  other: 'OTHR01',
  'other 1': 'OTHR01',
  rasam: 'COLB06',
  'ra sam': 'COLB06',
  "rasam'26": 'COLB06',
  "rasam' 26": 'COLB06',
  vihaara: 'VHRA14',
  vihara: 'VHRA14',
  'vihaara 14': 'VHRA14',
  grant: 'GRNT01',
  'grant 1': 'GRNT01',
  // "Collaboration" alone is ambiguous (colb06 / colb07 / bjmn09) — leave unmapped
  futuremindz: 'FMDZ07',
  'future mindz': 'FMDZ07',
  foundation: 'FMDZ07',
  'workshop 7': 'FMDZ07',
  'life art archival': 'LIRR03',
  'life art': 'LIRR03',
  'bali in bengaluru': 'COLB07',
  'bali in bangalore': 'COLB07',
  'bali in blr': 'COLB07',
  bali: 'COLB07',
  bytes: 'BYTE00',
  'param bytes': 'BYTE00',
  'baja mana': 'BJMN09',
  bajamana: 'BJMN09',
  bhajamana: 'BJMN09',
  'bhajamana collaboration': 'BJMN09',
  'bhajamana collaboration - 9': 'BJMN09',
  'collaborations 9': 'BJMN09',
  parampara: 'PRPA10',
  'parampara 10': 'PRPA10',
  'parampara 9': 'PRPA09',
  tantra: 'TNTR06',
  'tantra 6': 'TNTR06',
  'kala samvaada': 'KLSM06',
  exhibition: 'EXBT01',
  'annual report': 'ARPT26',
  'no task': 'DTOD00',
  'just log': 'DTOD00',
});

/**
 * Parenthetical / trailing status crumbs from WA reports.
 * Order matters: more specific first.
 */
const PAREN_STATUS = [
  {
    re: /\(\s*done\s*;\s*approval\s*awaited\s*\)/i,
    status: 'Done',
    reviewHint: 'under_review',
  },
  { re: /\(\s*done\s*;\s*approved\s*\)/i, status: 'Done', reviewHint: 'none' },
  { re: /\(\s*not\s*added\s*but\s*done\s*\)/i, status: 'Done', reviewHint: 'none' },
  { re: /\(\s*on\s*review\s*\)/i, status: 'Active', reviewHint: 'under_review' },
  { re: /\(\s*on\s*going\s*\)/i, status: 'Active', reviewHint: 'none' },
  { re: /\(\s*ongoing\s*\)/i, status: 'Active', reviewHint: 'none' },
  { re: /\(\s*on\s*process(?:\s+already)?\s*\)/i, status: 'Active', reviewHint: 'none' },
  { re: /\(\s*currently\s*searching[^)]*\)/i, status: 'Active', reviewHint: 'none' },
  { re: /\(\s*done\s*\)/i, status: 'Done', reviewHint: 'none' },
  { re: /\(\s*approved\s*\)/i, status: 'Done', reviewHint: 'none' },
];

const TRAIL_STATUS = [
  { re: /[-–—]?\s*\bon\s*going\b\s*$/i, status: 'Active', reviewHint: 'none' },
  { re: /[-–—]?\s*\bongoing\b\s*$/i, status: 'Active', reviewHint: 'none' },
  { re: /\bdone\b/i, status: 'Done', reviewHint: 'none', stripWord: true },
];

function detectFormat(text) {
  const t = String(text || '').trim();
  if (!t) return 'empty';
  if (t.startsWith('[') || t.startsWith('{')) return 'json';
  const first = t.split(/\r?\n/).find((l) => l.trim()) || '';
  if (first.indexOf('\t') >= 0) return 'tsv';
  if (
    /,/g.test(first) &&
    /(^|,)\s*(name|task|project|assignee|user)/i.test(first)
  ) {
    return 'csv';
  }
  if ((first.match(/,/g) || []).length >= 2 && !first.startsWith('*') && !first.startsWith('[')) {
    return 'csv';
  }
  return 'freeform';
}

function applyStatusHints(rawName) {
  let name = String(rawName || '').trim();
  let status = 'Active';
  let reviewHint = 'none';

  for (const h of PAREN_STATUS) {
    if (!h.re.test(name)) continue;
    if (h.status === 'Done') status = 'Done';
    if (h.reviewHint && h.reviewHint !== 'none') reviewHint = h.reviewHint;
    name = name.replace(h.re, '').replace(/\s{2,}/g, ' ').trim();
  }

  for (const h of TRAIL_STATUS) {
    if (!h.re.test(name)) continue;
    if (h.status === 'Done') status = 'Done';
    if (h.reviewHint && h.reviewHint !== 'none') reviewHint = h.reviewHint;
    if (h.stripWord) {
      name = name.replace(/\bdone\b/i, '').replace(/\s{2,}/g, ' ').trim();
    } else {
      name = name.replace(h.re, '').trim();
    }
  }

  name = name.replace(/\s*[-–—;,]+\s*$/, '').trim();
  name = name.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  return { name, status, reviewHint };
}

function cleanReportDate(raw) {
  return String(raw || '')
    .replace(/:?\s*tasks?\s*(finished|done|list)?\s*:?\s*$/i, '')
    .replace(/^:?\s*/, '')
    .trim();
}

function parsePersonHeader(trimmed) {
  // "Ashwin | 11th July" / "Ashwin | 11th July: Tasks finished"
  const piped = trimmed.match(/^([A-Za-z][A-Za-z .'-]{1,40})\s*[|–—]\s*(.+)$/);
  if (piped && !/^tasks?\b/i.test(piped[1]) && trimmed.indexOf('[') < 0) {
    return { person: piped[1].trim(), reportDate: cleanReportDate(piped[2]) };
  }
  // "Aishwarya 16th July - tasks finished" / "Aishwarya 13th July : Tasks finished"
  const spaced = trimmed.match(
    /^([A-Za-z][A-Za-z .'-]{1,40})\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\b.*)$/i
  );
  if (spaced && !/^tasks?\b/i.test(spaced[1]) && trimmed.indexOf('[') < 0) {
    const rest = cleanReportDate(spaced[2].replace(/^\s*[-–—:]\s*/, ''));
    if (rest) return { person: spaced[1].trim(), reportDate: rest };
  }
  return null;
}

function parseJson(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.tasks || data.items || [data];
  const out = [];
  arr.forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    const rawName = row.name || row.task || row.title || '';
    const hinted = applyStatusHints(rawName);
    out.push({
      sourceIndex: i,
      raw: JSON.stringify(row),
      name: hinted.name || String(rawName).trim(),
      projectHint: String(row.project || row.projectName || row.projectCode || '').trim(),
      assigneeHint: String(row.assignee || row.assigneeUsername || row.user || row.person || '').trim(),
      reportPerson: String(row.reportPerson || row.person || row.assignee || '').trim(),
      reportDate: String(row.reportDate || row.date || '').trim(),
      description: String(row.description || row.desc || '').trim(),
      notes: String(row.notes || '').trim(),
      status: row.status || hinted.status,
      reviewHint: hinted.reviewHint,
      link: String(row.link || row.url || '').trim(),
    });
  });
  return out;
}

function splitDelimited(line, delim) {
  if (delim === ',') {
    const cells = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = !q;
      } else if (ch === ',' && !q) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  }
  return line.split(delim).map((c) => c.trim());
}

function parseDelimited(text, delim) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const headerCells = splitDelimited(lines[0], delim).map((h) => h.toLowerCase());
  const idx = (names) => {
    for (const n of names) {
      const i = headerCells.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const hasHeader =
    idx(['name', 'task', 'title']) >= 0 || idx(['project', 'projectname', 'projectcode']) >= 0;
  const start = hasHeader ? 1 : 0;
  const iName = hasHeader ? idx(['name', 'task', 'title']) : 0;
  const iProject = hasHeader ? idx(['project', 'projectname', 'projectcode', 'proj']) : 1;
  const iAssignee = hasHeader ? idx(['assignee', 'assigneusername', 'user', 'person', 'username']) : 2;
  const iDesc = hasHeader ? idx(['description', 'desc']) : -1;
  const iNotes = hasHeader ? idx(['notes', 'note']) : -1;
  const iLink = hasHeader ? idx(['link', 'url']) : -1;
  const out = [];
  for (let li = start; li < lines.length; li++) {
    const cells = splitDelimited(lines[li], delim);
    const rawName = iName >= 0 ? cells[iName] || '' : '';
    if (!String(rawName).trim()) continue;
    const hinted = applyStatusHints(rawName);
    const who = iAssignee >= 0 ? cells[iAssignee] || '' : '';
    out.push({
      sourceIndex: li,
      raw: lines[li],
      name: hinted.name,
      projectHint: iProject >= 0 ? cells[iProject] || '' : '',
      assigneeHint: who,
      reportPerson: who,
      reportDate: '',
      description: iDesc >= 0 ? cells[iDesc] || '' : '',
      notes: iNotes >= 0 ? cells[iNotes] || '' : '',
      status: hinted.status,
      reviewHint: hinted.reviewHint,
      link: iLink >= 0 ? cells[iLink] || '' : '',
    });
  }
  return out;
}

/**
 * Freeform / WhatsApp paste:
 *   Ashwin | 31st July
 *   [Cult edits +]
 *   * Rasam promo done (on review)
 */
function parseFreeform(text) {
  const lines = String(text || '').split(/\r?\n/);
  let person = '';
  let reportDate = '';
  let section = '';
  const out = [];
  let idx = 0;

  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    if (/^[.…\-–—_]{3,}$/.test(trimmed)) continue;

    const header = parsePersonHeader(trimmed);
    if (header) {
      person = header.person;
      reportDate = header.reportDate;
      section = '';
      continue;
    }
    if (/^tasks?\s*(done|finished|list)?\s*:?\s*$/i.test(trimmed)) continue;
    if (/^to\s*add\s*:?\s*$/i.test(trimmed)) continue;

    const sec = trimmed.match(/^\[\s*([^\]]+?)\s*\]\s*$/);
    if (sec) {
      section = sec[1].trim();
      continue;
    }

    const bullet = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    const body = bullet ? bullet[1].trim() : null;
    const taskLine = body || (section && !trimmed.startsWith('#') ? trimmed : null);
    if (!taskLine) continue;
    if (/^(tasks?\s*(done|finished)|report)\b/i.test(taskLine)) continue;

    const hinted = applyStatusHints(taskLine);
    if (!hinted.name) continue;
    const notes = [
      person && reportDate ? person + ' | ' + reportDate : person || reportDate,
      section && 'section: ' + section,
    ]
      .filter(Boolean)
      .join(' · ');
    out.push({
      sourceIndex: idx++,
      raw: trimmed,
      name: hinted.name,
      projectHint: section,
      assigneeHint: person,
      reportPerson: person,
      reportDate,
      description: '',
      notes,
      status: hinted.status,
      reviewHint: hinted.reviewHint,
      link: '',
    });
  }
  return out;
}

/**
 * @param {string} text
 * @returns {{ format: string, rows: object[] }}
 */
function parseInjectText(text) {
  const format = detectFormat(text);
  if (format === 'empty') return { format, rows: [] };
  try {
    if (format === 'json') return { format, rows: parseJson(text) };
    if (format === 'tsv') return { format, rows: parseDelimited(text, '\t') };
    if (format === 'csv') return { format, rows: parseDelimited(text, ',') };
    return { format: 'freeform', rows: parseFreeform(text) };
  } catch (err) {
    if (format === 'json') {
      return { format: 'freeform', rows: parseFreeform(text), parseWarning: String(err.message || err) };
    }
    throw err;
  }
}

function resolveProjectHint(hint) {
  const h = String(hint || '').trim().replace(/\s+/g, ' ');
  if (!h) return '';
  const alias = PROJECT_ALIASES[normName(h).replace(/\s+/g, ' ')];
  return alias || h;
}

/** Labels an admin project can match on (dropdown label, pseudo name, etc.). */
function projectMatchKeys(p) {
  if (!p) return [];
  return [p.name, p.label, p.dropdownLabel, p.pseudoName, p.pseudo]
    .filter(Boolean)
    .map((s) => normName(s));
}

/**
 * @returns {{ project: object|null, via: 'code'|'exact'|'alias'|'soft'|'none' }}
 */
function matchProjectDetailed(hint, projects) {
  const raw = String(hint || '').trim();
  if (!raw) return { project: null, via: 'none' };
  const list = projects || [];
  const resolved = resolveProjectHint(raw);
  const aliased = normName(resolved) !== normName(raw);

  const byCodeRaw = list.find((p) => String(p.code).toUpperCase() === raw.toUpperCase());
  if (byCodeRaw) return { project: byCodeRaw, via: 'code' };
  const byCode = list.find((p) => String(p.code).toUpperCase() === resolved.toUpperCase());
  if (byCode) return { project: byCode, via: aliased ? 'alias' : 'code' };

  const nh = normName(resolved);
  const exact = list.find((p) => projectMatchKeys(p).some((k) => k === nh));
  if (exact) return { project: exact, via: aliased ? 'alias' : 'exact' };

  const includes = list.filter((p) =>
    projectMatchKeys(p).some((k) => k.indexOf(nh) >= 0 || nh.indexOf(k) >= 0)
  );
  if (includes.length === 1) return { project: includes[0], via: aliased ? 'alias' : 'soft' };
  if (includes.length > 1) {
    const cult = includes.find((p) =>
      projectMatchKeys(p).some((k) => /cult\s*edits/.test(k))
    );
    if (cult && /edit/i.test(nh)) return { project: cult, via: aliased ? 'alias' : 'soft' };
  }
  return { project: null, via: 'none' };
}

function matchProject(hint, projects) {
  return matchProjectDetailed(hint, projects).project;
}

function matchUser(hint, users) {
  const h = String(hint || '').trim();
  if (!h) return null;
  const list = users || [];
  const byUser = list.find((u) => String(u.username).toLowerCase() === h.toLowerCase());
  if (byUser) return byUser;
  const nd = normName(h);
  const byName = list.filter((u) => normName(u.displayName) === nd);
  if (byName.length === 1) return byName[0];
  // "Jois" vs "Param Jois Harshitha" / first-token match
  const soft = list.filter((u) => {
    const dn = normName(u.displayName);
    if (dn.indexOf(nd) >= 0 || nd.indexOf(dn) >= 0) return true;
    const first = dn.split(/\s+/)[0];
    return first === nd;
  });
  if (soft.length === 1) return soft[0];
  return null;
}

module.exports = {
  detectFormat,
  parseInjectText,
  applyStatusHints,
  matchProject,
  matchProjectDetailed,
  matchUser,
  resolveProjectHint,
  PROJECT_ALIASES,
};
