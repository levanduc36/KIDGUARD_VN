import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.mjs';

test('teacher-code CLI uses the configured database, rejects wrong secrets and validates expiry', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kidguard-cli-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const instance = await createApp({ databasePath });
  t.after(() => { instance.close(); rmSync(directory, { recursive: true, force: true }); });
  const secret = 'automated-test-secret-only';
  const run = args => spawnSync(process.execPath, ['scripts/teacher-codes.mjs', ...args], {
    encoding: 'utf8', env: { ...process.env, DATABASE_PATH: databasePath, ADMIN_SETUP_SECRET: secret }, timeout: 10000,
  });
  assert.equal(run(['create', 'Giáo viên', 'incorrect-secret', '90']).status, 1);
  assert.equal(run(['create', 'Giáo viên', secret, '0']).status, 1);
  assert.equal(run(['create', 'Giáo viên', secret, '1.5']).status, 1);
  assert.equal(instance.db.prepare('SELECT count(*) n FROM teacher_access_codes').get().n, 0);
  const created = run(['create', 'Giáo viên kiểm thử', secret, '90']);
  assert.equal(created.status, 0, created.stderr);
  const code = created.stdout.match(/TEACH-[A-Z2-9]{10}/)?.[0];
  assert.ok(code);
  assert.ok(!created.stdout.includes(secret));
  const row = instance.db.prepare('SELECT * FROM teacher_access_codes').get();
  assert.equal(row.code_hash, createHash('sha256').update(code).digest('hex'));
  assert.equal(row.expires_at - row.created_at, 90 * 24 * 60 * 60 * 1000);
  assert.equal(row.used_at, null);
  const noTerminal = run(['create', 'Giáo viên', '--days', '90']);
  assert.equal(noTerminal.status, 1);
  assert.match(noTerminal.stderr, /terminal/);
  assert.equal(instance.db.prepare('SELECT count(*) n FROM teacher_access_codes').get().n, 1);
});
