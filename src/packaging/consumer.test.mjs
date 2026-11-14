import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const packageName = '@fantastic.dev/convex-env-sync';
const entrypoints = {
  '': ['selectValues', 'plan', 'reconcile', 'resolveStage', 'runStage'],
  '/sources/doppler': ['loadDoppler'],
  '/sources/infisical': ['loadInfisical'],
  '/convex/deployment': ['deploymentIdentity', 'planDeployment', 'applyDeployment'],
  '/convex/defaults': ['defaultsIdentity', 'planDefaults', 'applyDefaults'],
  '/cli': ['runCli'],
  '/alchemy': ['Sync', 'syncProvider'],
};
const run = (command, args, cwd) => exec(command, args, { cwd, timeout: 120_000, maxBuffer: 2 ** 20,
  env: { ...process.env, CI: 'true', NODE_OPTIONS: '', npm_config_registry: 'http://127.0.0.1:1' } });

test('packed artifact works in an isolated offline consumer and excludes private files', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'env-sync-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const packRoot = join(dir, 'source');
  const consumer = join(dir, 'consumer');
  await mkdir(packRoot);
  await mkdir(consumer);
  for (const file of ['package.json', 'README.md', 'LICENSE', 'src', 'docs', 'assets']) {
    await cp(join(root, file), join(packRoot, file), { recursive: true });
  }
  // Deliberate synthetic contamination tests the packaging boundary, never secrets.
  for (const file of ['.env', 'src/credential.env', 'src/evidence.log', 'src/test-fixture.mjs', 'docs/evidence.json', 'docs/evidence.md', 'src/core/credentials.js']) {
    await writeFile(join(packRoot, file), 'synthetic-package-exclusion-canary');
  }
  await run('pnpm', ['pack', '--pack-destination', dir, '--json'], packRoot);
  const archives = (await readdir(dir)).filter((name) => name.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const archive = join(dir, archives[0]);
  const { stdout: listing } = await run('tar', ['-tzf', archive], dir);
  const files = listing.trim().split('\n').map((name) => name.replace(/^package\//, ''));

  await t.test('artifact contains runtime exports and only explicitly allowed files', async () => {
    assert.ok(files.includes('src/index.js'), 'packed root entrypoint is missing');
    assert.ok(files.includes('src/cli/main.js'));
    assert.ok(files.includes('assets/fantastic-dev-logo.svg'));
    for (const file of files) {
      assert.match(file, /^(?:package\.json|README\.md|LICENSE|assets\/fantastic-dev-logo\.svg|src\/(?:README\.md|index\.js|(?:core|convex|sources|alchemy|cli)\/[a-z-]+\.js)|docs\/[a-z-]+\.md)$/);
    }
    const unpacked = join(dir, 'audit');
    await mkdir(unpacked);
    await run('tar', ['-xzf', archive, '-C', unpacked], dir);
    for (const file of files) assert.ok(!(await readFile(join(unpacked, 'package', file), 'utf8')).includes('synthetic-package-exclusion-canary'));
  });

  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { [packageName]: `file:${archive}` } }));
  await run('pnpm', ['install', '--offline', '--ignore-scripts', '--config.auto-install-peers=false'], consumer);
  const installed = await realpath(join(consumer, 'node_modules', packageName));
  assert.ok(installed.startsWith(await realpath(consumer)), 'consumer must not link to the source checkout');
  const verifyImports = async (entries) => {
    const script = `import assert from 'node:assert/strict';
globalThis.fetch = () => { throw new Error('Unexpected network call'); };
for (const [suffix, names] of Object.entries(${JSON.stringify(entries)})) {
  const module = await import(${JSON.stringify(packageName)} + suffix);
  for (const name of names) assert.equal(typeof module[name], 'function', suffix + ':' + name);
}`;
    await run(process.execPath, ['--input-type=module', '-e', script], consumer);
  };

  await t.test('non-Alchemy imports and installed CLI plan run without the optional peer', async () => {
    await run(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; assert.throws(()=>import.meta.resolve('alchemy'));`], consumer);
    await verifyImports(Object.fromEntries(Object.entries(entrypoints).filter(([name]) => name !== '/alchemy')));
    const target = { kind: 'cloud', url: 'https://example-preview.convex.cloud', teamId: 1, projectId: 2, deploymentId: 3, deploymentType: 'preview' };
    await writeFile(join(consumer, 'sync.json'), JSON.stringify({ stages: { preview: { kind: 'preview', source: 'fixture', target } } }));
    await writeFile(join(consumer, 'runtime.mjs'), `export function createRuntime() { return {
  sources: {fixture: async()=>({defaults:{TOKEN:'synthetic-consumer-secret'},deployment:{}})},
  getToken: async()=> 'synthetic-consumer-credential',
  fetch: async(url, options={})=> {
    if (options.method && options.method !== 'GET') throw new Error('Plan attempted a write');
    const u = new URL(url);
    if(u.origin !== 'https://example-preview.convex.cloud') throw new Error('Unexpected destination');
    if(u.pathname === '/api/v1/deployment_info') return Response.json({kind:'cloud',id:3,projectId:2,teamId:1,deploymentType:'preview'});
    if(u.pathname === '/api/v1/list_environment_variables') return Response.json({environmentVariables:{UNRELATED:'retained'}});
    throw new Error('Unexpected API');
  }
}; }
`);
    const { stdout, stderr } = await run(join(consumer, 'node_modules/.bin/convex-env-sync'), ['plan', '--stage', 'preview', '--config', 'sync.json', '--runtime', 'runtime.mjs'], consumer);
    assert.equal(stderr, '');
    const report = JSON.parse(stdout);
    assert.deepEqual(report.operations, [{ name: 'TOKEN', operation: 'set' }]);
    assert.deepEqual(report.ownership.managedNames, ['TOKEN']);
    assert.ok(!stdout.includes('synthetic-consumer'));
    assert.equal((await readdir(consumer)).some((name) => name.endsWith('.lock') || name.includes('ownership')), false);
  });

  await t.test('Alchemy entrypoint imports when the documented peer is installed', async () => {
    await run('pnpm', ['add', '--offline', '--ignore-scripts', 'alchemy@2.0.0-beta.87', '--config.auto-install-peers=false'], consumer);
    await verifyImports({ '/alchemy': entrypoints['/alchemy'] });
  });
});
