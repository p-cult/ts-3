'use strict';

/**
 * Safe static file serving from frontendDir only.
 * No directory listing. Path traversal blocked.
 */

const fs = require('fs');
const path = require('path');
const { sendRaw } = require('./http');
const { notFound } = require('./errors');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

/**
 * Resolve a URL pathname to a file under rootDir, or null if unsafe/missing.
 * @param {string} rootDir
 * @param {string} pathname
 */
function resolveSafe(rootDir, pathname) {
  let rel = decodeURIComponent(pathname || '/');
  if (rel.includes('\0')) return null;
  if (rel.startsWith('/')) rel = rel.slice(1);
  if (!rel || rel.endsWith('/')) rel = path.join(rel, 'index.html');

  const root = path.resolve(rootDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    // SPA-ish fallback: unknown paths → index.html if present
    if (!path.extname(rel)) {
      const index = path.join(root, 'index.html');
      if (fs.existsSync(index) && fs.statSync(index).isFile()) return index;
    }
    return null;
  }
  return abs;
}

/**
 * @param {import('http').ServerResponse} res
 * @param {string} rootDir
 * @param {string} pathname
 * @returns {boolean} true if handled (including 404 throw path — throws notFound)
 */
function tryServeStatic(res, rootDir, pathname) {
  const filePath = resolveSafe(rootDir, pathname);
  if (!filePath) throw notFound('File not found');
  const body = fs.readFileSync(filePath);
  sendRaw(res, 200, body, contentTypeFor(filePath), {
    'Cache-Control': 'no-cache',
  });
  return true;
}

module.exports = { tryServeStatic, resolveSafe, contentTypeFor, MIME };
