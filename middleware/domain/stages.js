'use strict';

/**
 * Stages parse — pure. Tokens must match /^#[A-Za-z0-9][A-Za-z0-9._\-]*$/
 * One token per stage; no spaces inside a token.
 * Never throws — always { ok, tokens } | { ok:false, error }.
 */

const TOKEN_RE = /^#[A-Za-z0-9][A-Za-z0-9._\-]*$/;

function spaceAfterHashError() {
  return {
    ok: false,
    error:
      'invalid stage token — no spaces after #; use #take or #fill-and-sign (not "# tak")',
  };
}

function loneHashError(context) {
  return {
    ok: false,
    error:
      'invalid stage token "#" — trailing or lone # is incomplete'
      + (context ? ' (' + context + ')' : '')
      + '; use #take or #fill-and-sign',
  };
}

/**
 * @param {string|string[]} input
 * @returns {{ ok: true, tokens: string[] } | { ok: false, error: string }}
 */
function parseStageTokens(input) {
  try {
    let parts = [];
    if (Array.isArray(input)) {
      parts = input.map((s) => String(s || '').trim()).filter(Boolean);
    } else {
      const raw = String(input == null ? '' : input);
      const trimmed = raw.trim();
      if (!trimmed) return { ok: true, tokens: [] };

      // "# tak" or "#  fill" → space after hash (common mistake)
      if (/#\s/.test(trimmed)) {
        return spaceAfterHashError();
      }

      // Trailing broken token: ends with lone "#" (e.g. "#design #")
      if (/(^|\s)#$/.test(trimmed)) {
        return loneHashError('at end of input');
      }

      parts = trimmed.split(/\s+/).filter(Boolean);
    }

    const tokens = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
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
        return loneHashError(i === parts.length - 1 ? 'trailing' : 'in list');
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
  } catch (e) {
    return {
      ok: false,
      error: 'invalid stage tokens — could not parse (' + (e && e.message ? e.message : 'error') + ')',
    };
  }
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
