#!/usr/bin/env node
/**
 * build-pages.cjs — bake the production FRONTEND for GitHub Pages.
 *
 *   Frontend  → https://p-cult.github.io/task/
 *   Middleware → https://param-task-middleware.onrender.com
 *
 * Source HTML is written for same-origin `/api/...` + `/shared/...` (local `./run.sh`).
 * This script produces a standalone Pages file that:
 *   - inlines `/shared/param.css` (Pages has no `/shared` static tree)
 *   - points every `/api/...` fetch at the live Render API
 *   - keeps Bearer `ts3_token` for cross-origin auth
 *   - strips fixture login password hints
 *   - hides the STAGING badge until runtime health says staging
 *
 * Output → dist/index.html (copy/push to the p-cult/task Pages repo).
 *
 * Override API origin: API_ORIGIN=https://… node build-pages.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const API_ORIGIN = String(
  process.env.API_ORIGIN || 'https://param-task-middleware.onrender.com'
).replace(/\/$/, '');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const CSS_FILES = {
  '/shared/param.css': 'middleware/shared/param.css',
};

const SHIM = `<script>
(function () {
  var API_ORIGIN = ${JSON.stringify(API_ORIGIN)};
  var TOKEN_KEY = 'ts3_token';
  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  var _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : (input && input.url);
    if (url && url.charAt(0) === '/') { url = API_ORIGIN + url; }
    init.credentials = init.credentials || 'include';
    var tok = getToken();
    if (tok) {
      var headers = init.headers;
      if (headers && typeof Headers !== 'undefined' && headers instanceof Headers) {
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + tok);
      } else {
        init.headers = Object.assign({}, headers || {}, { Authorization: 'Bearer ' + tok });
      }
    }
    var res = await _fetch(url, init);
    if (url && url.indexOf('/api/login') >= 0) {
      var t = res.headers.get('X-Session-Token');
      if (t) setToken(t);
    }
    if (url && url.indexOf('/api/logout') >= 0) { clearToken(); }
    return res;
  };
})();
</script>`;

function stripForProd(html) {
  return html
    // Fixture passwords must never ship to the public URL
    .replace(
      /<p class="muted"[^>]*id="loginHint"[^>]*>[\s\S]*?<\/p>/,
      '<p class="muted" id="loginHint">Sign in with your Master sheet username.</p>'
    )
    .replace(
      /<p class="muted"[^>]*>Primary:[\s\S]*?<\/p>/,
      '<p class="muted" id="loginHint">Sign in with your Master sheet username.</p>'
    )
    .replace(
      /<title>Task Board — ts-3 Staging<\/title>/,
      '<title>Task Board — Param</title>'
    );
}

function bake(html) {
  // Inline shared CSS — GitHub Pages has no /shared/* tree; absolute /shared
  // links 404 at p-cult.github.io/shared/... and smash timer/status chrome.
  for (const [href, file] of Object.entries(CSS_FILES)) {
    const tag = new RegExp('<link[^>]*href="' + href.replace(/\./g, '\\.') + '"[^>]*>');
    if (!tag.test(html)) {
      throw new Error('bake: missing stylesheet link for ' + href);
    }
    html = html.replace(tag, '<style>\n' + read(file) + '\n</style>');
  }
  html = html.replace(/<head>/i, '<head>\n' + SHIM);
  html = stripForProd(html);
  return html;
}

const src = 'frontend/index.html';
const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const html = bake(read(src));
const outPath = path.join(outDir, 'index.html');
fs.writeFileSync(outPath, html);
console.log('  dist/index.html  (' + html.length + ' bytes)  <- ' + src);
console.log('Built 1 page. API -> ' + API_ORIGIN);
