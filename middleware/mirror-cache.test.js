'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSheetsData } = require('./data/sheets');

function ok(msg) {
  console.log('ok — ' + msg);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts3-mirror-'));
  const bridge = {
    configured: true,
    async getUsers() {
      return {
        users: [
          {
            username: 'admin',
            displayName: 'Admin',
            userSheet: 'user-01',
            role: 'admin',
          },
        ],
      };
    },
    async getProjects() {
      return { projects: [{ code: 'PRJ', name: 'Project' }] };
    },
    async getDepot() {
      return {
        rows: [
          {
            taskId: 'PRJ0011001A01',
            name: 'Cached task',
            status: 'Active',
            userSheet: 'user-01',
            assignedTo: 'user-01',
          },
        ],
      };
    },
    async ping() {
      return { ok: true };
    },
  };

  const sheets = createSheetsData({
    useLiveBridge: true,
    bridge,
    dataDir: dir,
    appMode: 'production',
    writerOfRecord: 'ts3',
    log: { info() {}, warn() {}, debug() {} },
  });

  const refreshed = await sheets.refreshFromBridge();
  assert.strictEqual(refreshed.ok, true);
  assert.ok(fs.existsSync(path.join(dir, 'mirror-cache.json')), 'mirror file written');
  assert.strictEqual(sheets.listDepot().length, 1);
  ok('save mirror after hydrate');

  // Simulate crash: new adapter, bridge down, load cache.
  const deadBridge = {
    configured: true,
    async getUsers() {
      throw new Error('timeout');
    },
    async getProjects() {
      throw new Error('timeout');
    },
    async getDepot() {
      throw new Error('timeout');
    },
  };
  const cold = createSheetsData({
    useLiveBridge: true,
    bridge: deadBridge,
    dataDir: dir,
    appMode: 'production',
    writerOfRecord: 'ts3',
    log: { info() {}, warn() {}, debug() {} },
  });
  assert.ok(cold.listDepot().length >= 0);
  const failed = await cold.refreshFromBridge();
  assert.strictEqual(failed.ok, false);

  const loaded = cold.loadMirrorCache();
  assert.strictEqual(loaded.ok, true);
  assert.strictEqual(cold.listDepot().length, 1);
  assert.strictEqual(cold.listDepot()[0].taskId, 'PRJ0011001A01');
  ok('boot from mirror cache after bridge failure');

  // Projects-only poll: rename without touching depot.
  let projectPhase = 0;
  let depotCalls = 0;
  const renameBridge = {
    configured: true,
    async getUsers() {
      return {
        users: [
          {
            username: 'admin',
            displayName: 'Admin',
            userSheet: 'user-01',
            role: 'admin',
          },
        ],
      };
    },
    async getProjects() {
      projectPhase += 1;
      if (projectPhase === 1) {
        return {
          projects: [
            { code: 'ALPHA1', name: 'Alpha Old', label: 'Alpha Old', pseudoName: '' },
          ],
        };
      }
      return {
        projects: [
          { code: 'ALPHA1', name: 'Alpha Renamed', label: 'Alpha Renamed', pseudoName: '' },
          { code: 'BETA01', name: 'Beta New', label: 'Beta New', pseudoName: '' },
        ],
      };
    },
    async getDepot() {
      depotCalls += 1;
      return {
        rows: [
          {
            taskId: 'ALPHA11001A01',
            name: 'Cached task',
            status: 'Active',
            userSheet: 'user-01',
            assignedTo: 'user-01',
          },
        ],
      };
    },
  };
  const live = createSheetsData({
    useLiveBridge: true,
    bridge: renameBridge,
    dataDir: dir,
    appMode: 'production',
    writerOfRecord: 'ts3',
    log: { info() {}, warn() {}, debug() {} },
  });
  await live.refreshFromBridge();
  assert.strictEqual(live.findProject('ALPHA1').name, 'Alpha Old');
  const beforeDepot = live.listDepot().length;
  const depotBeforePoll = depotCalls;
  const projOnly = await live.refreshProjectsFromBridge();
  assert.strictEqual(projOnly.ok, true);
  assert.strictEqual(projOnly.changed, true);
  assert.strictEqual(live.findProject('ALPHA1').name, 'Alpha Renamed');
  assert.ok(live.findProject('BETA01'));
  assert.strictEqual(live.listDepot().length, beforeDepot);
  assert.strictEqual(depotCalls, depotBeforePoll, 'projects-only must not call getDepot');
  ok('refreshProjectsFromBridge renames without depot touch');

  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
