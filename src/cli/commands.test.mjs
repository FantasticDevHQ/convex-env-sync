import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCli } from './commands.js';
import { runStage } from '../core/stages.js';
import { deploymentIdentity } from '../convex/deployment.js';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cloudTarget } from '../../test/sync-fixture.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'env-sync-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = join(dir, 'sync.json');
  const runtime = join(dir, 'runtime.mjs');
  const marker = join(dir, 'authenticated');
  const ownership = join(dir, 'ownership.json');
  const stages = { preview: { kind: 'preview', source: 'preview', target: cloudTarget } };
  await writeFile(config, JSON.stringify({ stages }));
  await writeFile(runtime, `import { writeFile } from 'node:fs/promises';
import { syncFixture } from ${JSON.stringify(new URL('../../test/sync-fixture.mjs', import.meta.url).href)};
export const f = syncFixture();
export const control = {};
await writeFile(${JSON.stringify(marker)}, 'runtime imported');
export function createRuntime() { return { sources: {preview: async()=>{ if(control.wait){control.entered();await control.wait;} return {defaults:{TOKEN:'new-synthetic-secret'},deployment:{}}; }}, getToken:async()=> 'synthetic-admin-token', fetch:f.fetch }; }
`);
  let out = '';
  let errors = '';
  const run = async (mode = 'plan', extra = []) => {
    out = ''; errors = '';
    const code = await runCli([mode, '--stage', 'preview', '--config', config, '--runtime', runtime, ...extra], { writeOut: (s) => { out += s; }, writeError: (s) => { errors += s; } });
    return { code, out, errors };
  };
  return { dir, config, runtime, marker, ownership, stages, run };
}

test('plan uses the shared pipeline and performs no provider or ownership write', async (t) => {
  const f = await fixture(t);
  const result = await f.run('plan', ['--ownership', f.ownership]);
  assert.equal(result.code, 0, result.errors);
  const module = await import(pathToFileURL(f.runtime).href);
  assert.equal(module.f.writes.length, 0);
  const shared = await runStage({ stages: f.stages, stage: 'preview', runtime: module.createRuntime(), mode: 'plan' });
  assert.deepEqual(JSON.parse(result.out), shared);
  await assert.rejects(access(f.ownership));
  assert.ok(!result.out.includes('new-synthetic-secret'));
});

test('apply requires explicit approval and persists only verified target ownership', async (t) => {
  const f = await fixture(t);
  const unapproved = await f.run('apply', ['--ownership', f.ownership]);
  assert.notEqual(unapproved.code, 0);
  await assert.rejects(access(f.marker));
  const result = await f.run('apply', ['--approve', '--ownership', f.ownership]);
  assert.equal(result.code, 0, result.errors);
  assert.equal(JSON.parse(result.out).verified, true);
  const state = JSON.parse(await readFile(f.ownership, 'utf8'));
  assert.deepEqual(Object.keys(state).sort(), ['managedNames', 'syncVersion', 'target']);
  assert.deepEqual(state.managedNames, ['TOKEN']);
  assert.ok(!JSON.stringify(state).includes('synthetic-secret'));
  const module = await import(pathToFileURL(f.runtime).href);
  assert.equal(module.f.remote.TOKEN, 'new-synthetic-secret');
  assert.equal(module.f.writes.length, 1);
  await assert.rejects(access(`${f.ownership}.lock`));
});

test('unknown stage and malformed config reject before importing authentication code', async (t) => {
  const f = await fixture(t);
  await writeFile(f.config, JSON.stringify({ stages: {} }));
  assert.notEqual((await f.run()).code, 0);
  await assert.rejects(access(f.marker));
  await writeFile(f.config, 'invalid-synthetic-secret');
  const result = await f.run();
  assert.notEqual(result.code, 0);
  assert.ok(!result.errors.includes('invalid-synthetic-secret'));
  await assert.rejects(access(f.marker));
});

test('verification failures never overwrite prior ownership or expose values', async (t) => {
  const f = await fixture(t);
  const module = await import(pathToFileURL(f.runtime).href);
  module.f.failVerification();
  const previous = JSON.stringify({ target: deploymentIdentity(cloudTarget), managedNames: ['FORMER'], syncVersion: 1 });
  await writeFile(f.ownership, previous);
  const result = await f.run('apply', ['--approve', '--ownership', f.ownership]);
  assert.notEqual(result.code, 0);
  assert.equal(result.out, '');
  assert.ok(!result.errors.includes('synthetic'));
  assert.equal(await readFile(f.ownership, 'utf8'), previous);
  await assert.rejects(access(`${f.ownership}.lock`));
});

test('busy ownership locks and mismatched metadata reject before runtime import', async (t) => {
  const f = await fixture(t);
  await writeFile(`${f.ownership}.lock`, 'another owner');
  assert.notEqual((await f.run('apply', ['--approve', '--ownership', f.ownership])).code, 0);
  assert.equal(await readFile(`${f.ownership}.lock`, 'utf8'), 'another owner');
  await assert.rejects(access(f.marker));
  await rm(`${f.ownership}.lock`);
  await writeFile(f.ownership, JSON.stringify({ target: 'another-target', managedNames: ['TOKEN'], syncVersion: 1 }));
  assert.notEqual((await f.run('apply', ['--approve', '--ownership', f.ownership])).code, 0);
  await assert.rejects(access(f.marker));
});

test('unknown or repeated flags and missing required arguments fail', async (t) => {
  const f = await fixture(t);
  assert.notEqual((await f.run('plan', ['--typo'])).code, 0);
  assert.notEqual((await f.run('plan', ['--stage', 'prod'])).code, 0);
  assert.notEqual(await runCli([], { writeOut: () => {}, writeError: () => {} }), 0);
  await assert.rejects(access(f.marker));
});


test('executable entrypoint returns redacted JSON and a nonzero invalid-stage exit', async (t) => {
  const f = await fixture(t);
  const binary = fileURLToPath(new URL('./main.js', import.meta.url));
  const execute = promisify(execFile);
  const args = ['plan', '--stage', 'preview', '--config', f.config, '--runtime', f.runtime];
  const result = await execute(process.execPath, [binary, ...args]);
  assert.deepEqual(JSON.parse(result.stdout).operations, [{ name: 'TOKEN', operation: 'set' }]);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes('new-synthetic-secret'));
  await assert.rejects(execute(process.execPath, [binary, ...args.map((arg) => arg === 'preview' ? 'unknown' : arg)]), (error) => {
    assert.notEqual(error.code, 0);
    assert.equal(error.stdout, '');
    return true;
  });
});


test('concurrent applies sharing ownership serialize while the first source read is live', async (t) => {
  const f = await fixture(t);
  const module = await import(pathToFileURL(f.runtime).href);
  let release;
  let entered;
  module.control.wait = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { entered = resolve; });
  module.control.entered = entered;
  const args = ['apply', '--stage', 'preview', '--config', f.config, '--runtime', f.runtime, '--approve', '--ownership', f.ownership];
  const first = runCli(args, { writeOut: () => {}, writeError: () => {} });
  await ready;
  try {
    assert.notEqual(await runCli(args, { writeOut: () => {}, writeError: () => {} }), 0);
    assert.equal(JSON.parse(await readFile(`${f.ownership}.lock`, 'utf8')).pid, process.pid);
    assert.equal(module.f.writes.length, 0);
  } finally { release(); }
  assert.equal(await first, 0);
  assert.equal(module.f.writes.length, 1);
});
