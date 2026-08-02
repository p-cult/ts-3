'use strict';

/**
 * Slice 12 — go-live.sh exists + health slice 14.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { startServer } = require('./server');

let passed = 0;
let failed = 0;
function ok(n) {
  passed += 1;
  console.log('  ok  — ' + n);
}
function fail(n, e) {
  failed += 1;
  console.error('  FAIL — ' + n, e && e.message ? e.message : e);
}

async function main() {
  console.log('slice 12 tests\n');

  try {
    const script = path.join(__dirname, '..', 'go-live.sh');
    assert.ok(fs.existsSync(script), 'go-live.sh missing');
    const mode = fs.statSync(script).mode;
    assert.ok(mode & 0o111, 'go-live.sh not executable');
    const body = fs.readFileSync(script, 'utf8');
    assert.ok(body.includes('APP_MODE=production'));
    assert.ok(body.includes('ts-2'));
    assert.ok(!/\brm\s+-rf\b/.test(body));
    ok('go-live.sh exists, executable, documents production flip');
  } catch (e) {
    fail('go-live.sh', e);
  }

  try {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'GO-LIVE.md')));
    ok('docs/GO-LIVE.md present');
  } catch (e) {
    fail('GO-LIVE.md', e);
  }

  const server = await startServer({ host: '127.0.0.1', port: 0 });
  const port = server.address().port;
  try {
    const json = await new Promise((resolve, reject) => {
      http
        .get({ hostname: '127.0.0.1', port, path: '/api/health' }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          });
        })
        .on('error', reject);
    });
    assert.strictEqual(json.slice, '14');
    ok('health reports slice 14');
  } catch (e) {
    fail('health slice 14', e);
  } finally {
    await new Promise((r) => server.close(r));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
