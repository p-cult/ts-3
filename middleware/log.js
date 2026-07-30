'use strict';

/**
 * Tiny structured logger — stdout JSON lines.
 * Levels: error=0, warn=1, info=2, debug=3
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

let minLevel = LEVELS.info;

function setLevel(name) {
  const key = String(name || 'info').toLowerCase();
  minLevel = LEVELS[key] !== undefined ? LEVELS[key] : LEVELS.info;
}

function write(level, msg, fields) {
  if ((LEVELS[level] ?? 99) > minLevel) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: String(msg),
  };
  if (fields && typeof fields === 'object') {
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) line[k] = v;
    }
  }
  const out = level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + '\n');
}

const log = {
  setLevel,
  error(msg, fields) { write('error', msg, fields); },
  warn(msg, fields) { write('warn', msg, fields); },
  info(msg, fields) { write('info', msg, fields); },
  debug(msg, fields) { write('debug', msg, fields); },
  child(baseFields) {
    const wrap = (level) => (msg, fields) =>
      write(level, msg, { ...baseFields, ...(fields || {}) });
    return {
      error: wrap('error'),
      warn: wrap('warn'),
      info: wrap('info'),
      debug: wrap('debug'),
    };
  },
};

module.exports = { log, setLevel, LEVELS };
