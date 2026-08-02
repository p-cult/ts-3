'use strict';

/**
 * Background Sheets sync — drains ephemeral outbox off the request path.
 */

function createSheetsWorker(deps) {
  const outbox = deps.outbox;
  const sheets = deps.sheets; // createSheetsData instance (pushLiveBirth/Patch)
  const log = deps.log || { info() {}, warn() {}, debug() {} };
  const intervalMs = Math.max(500, Number(deps.intervalMs) || 1500);
  const batchSize = Math.max(1, Number(deps.batchSize) || 3);

  let timer = null;
  let stopped = true;
  let running = false;
  let purgeAt = 0;

  async function flushOne(item) {
    const row = item.row;
    if (!row) throw new Error('outbox item missing row');
    if (item.op === 'birth') {
      await sheets.pushLiveBirth(row);
    } else {
      await sheets.pushLivePatch(row);
    }
  }

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      if (Date.now() > purgeAt) {
        outbox.purge();
        purgeAt = Date.now() + 60 * 60 * 1000;
      }
      const batch = outbox.claim(batchSize);
      for (const item of batch) {
        try {
          await flushOne(item);
          outbox.markSynced(item.id);
          log.info('outbox synced', { id: item.id, op: item.op, taskId: item.taskId });
        } catch (err) {
          const attempts = Number(item.attempts) || 1;
          const backoff = Math.min(60000, 1500 * Math.pow(2, Math.min(attempts, 6)));
          outbox.markRetry(item.id, err && err.message, backoff);
          log.warn('outbox sync failed', {
            id: item.id,
            op: item.op,
            taskId: item.taskId,
            attempt: attempts,
            err: String(err && err.message),
            retryInMs: backoff,
          });
        }
      }
    } finally {
      running = false;
    }
  }

  async function loop() {
    while (!stopped) {
      await tick();
      if (stopped) break;
      await outbox.waitForWake(intervalMs);
    }
  }

  return {
    start() {
      if (!outbox || !sheets) return;
      if (!stopped) return;
      stopped = false;
      outbox.releaseInFlight();
      outbox.purge();
      purgeAt = Date.now() + 60 * 60 * 1000;
      loop().catch((err) => {
        log.warn('sheets worker loop ended', { err: String(err && err.message) });
      });
      log.info('sheets write-behind worker started', { intervalMs, batchSize });
    },

    stop() {
      stopped = true;
    },

    async flushNow() {
      await tick();
    },

    stats() {
      return outbox && typeof outbox.stats === 'function' ? outbox.stats() : null;
    },
  };
}

module.exports = { createSheetsWorker };
