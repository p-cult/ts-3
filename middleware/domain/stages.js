'use strict';

/**
 * Stages parse — pure. Tokens must match /^#[A-Za-z0-9][A-Za-z0-9._\-]*$/
 * One token per stage; no spaces inside a token.
 */

const TOKEN_RE = /^#[A-Za-z0-9][A-Za-z0-9._\-]*$/;

/**
 * @param {string|string[]} input
 * @returns {{ ok: true, tokens: string[] } | { ok: false, error: string }}
 */
function parseStageTokens(input) {
  let parts = [];
  if (Array.isArray(input)) {
    parts = input.map((s) => String(s || '').trim()).filter(Boolean);
  } else {
    const raw = String(input == null ? '' : input).trim();
    if (!raw) return { ok: true, tokens: [] };

    // "# tak" or "#  fill" → space after hash (common mistake)
    if (/#\s/.test(raw)) {
      return {
        ok: false,
        error:
          'invalid stage token — no spaces after #; use #take or #fill-and-sign (not "# tak")',
      };
    }

    parts = raw.split(/\s+/).filter(Boolean);
  }

  const tokens = [];
  for (const p of parts) {
    if (/\s/.test(p)) {
      return {
        ok: false,
        error:
          'invalid stage token "' +
          p +
          '" — no spaces inside a token; use #fill-and-sign',
      };
    }
    if (p === '#') {
      return {
        ok: false,
        error:
          'invalid stage token "#" — no spaces after #; use #take or #fill-and-sign',
      };
    }
    if (!p.startsWith('#')) {
      return {
        ok: false,
        error:
          'invalid stage token "' +
          p +
          '" — each stage must start with # (e.g. #design)',
      };
    }
    if (!TOKEN_RE.test(p)) {
      return {
        ok: false,
        error:
          'invalid stage token "' +
          p +
          '" — use #Name with letters/numbers/._- only (no spaces after #)',
      };
    }
    tokens.push(p);
  }
  return { ok: true, tokens };
}

/**
 * @param {{ tokens: string[], currentIndex: number }} stages
 */
function progress(stages) {
  const tokens = (stages && stages.tokens) || [];
  const n = tokens.length;
  if (!n) return { currentIndex: 0, total: 0, ratio: 0, label: '' };
  let i = Number(stages.currentIndex);
  if (!Number.isFinite(i) || i < 0) i = 0;
  if (i > n) i = n;
  return {
    currentIndex: i,
    total: n,
    ratio: i / n,
    label: i + '/' + n,
    currentToken: i > 0 && i <= n ? tokens[i - 1] : '',
  };
}

function clampIndex(tokens, currentIndex) {
  const n = (tokens || []).length;
  let i = Number(currentIndex);
  if (!Number.isFinite(i) || i < 0) i = 0;
  if (i > n) i = n;
  return i;
}

module.exports = {
  TOKEN_RE,
  parseStageTokens,
  progress,
  clampIndex,
};
