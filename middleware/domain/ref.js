'use strict';

/**
 * Opaque client handle for a Task ID — matches ts-2.
 * HMAC-SHA256(secret, taskId) hex, first 16 chars.
 * Never reversible to Task ID. Stable for PATCH /api/tasks/:ref.
 */

const crypto = require('crypto');

function refFor(taskId, secret) {
  if (!taskId) return '';
  const key = secret || process.env.SESSION_SECRET || 'dev-ref-secret';
  return crypto.createHmac('sha256', key).update(String(taskId)).digest('hex').slice(0, 16);
}

module.exports = { refFor };
