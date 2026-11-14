import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { auditArchive, tagVersion } from './artifact.mjs';
async function fixture(t, tamper, extra = false) {
  const root = await mkdtemp(join(tmpdir(), 'env-sync-release-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'),
    packed = join(root, 'package');
  await mkdir(source);
  await mkdir(packed);
  await mkdir(join(source, 'src'));
  await mkdir(join(packed, 'src'));
  const pkg = {
    name: '@fantastic.dev/convex-env-sync',
    version: '0.1.1',
    packageManager: 'pnpm@12.18.0',
    files: ['README.md', 'LICENSE', 'src/index.js'],
    publishConfig: {
      registry: 'https://registry.npmjs.org/',
      access: 'public',
      provenance: true,
    },
  };
  const files = {
    'package.json': JSON.stringify(pkg),
    'README.md': 'Public docs',
    LICENSE: 'MIT',
    'src/index.js': 'export const value=1;',
    'src/README.md': 'Public source guide',
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(join(source, name), value);
    const packedValue =
      name === 'package.json'
        ? JSON.stringify(
            Object.fromEntries(
              Object.entries(JSON.parse(value)).filter(
                ([key]) => key !== 'packageManager',
              ),
            ),
          )
        : value;
    await writeFile(
      join(packed, name),
      tamper?.(name, packedValue) ?? packedValue,
    );
  }
  if (extra)
    await writeFile(join(packed, 'unexpected.env'), 'synthetic-secret-canary');
  const archive = join(root, 'artifact.tgz');
  execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
  return { root: source, archive, tag: 'v0.1.1' };
}
test('tag inputs accept stable exact versions only', () => {
  assert.equal(tagVersion('v0.1.1'), '0.1.1');
  for (const value of [
    'v01.1.0',
    'refs/tags/v0.1.0',
    'v1.0.0-beta.1',
    'v1.0.0;echo',
    'v1.0',
    'v9007199254740992.0.0',
  ])
    assert.throws(() => tagVersion(value));
});
test('archive bytes match the explicit tagged source and metadata', async (t) => {
  const result = await auditArchive(await fixture(t));
  assert.equal(result.version, '0.1.1');
  assert.equal(result.fileCount, 5);
  assert.match(result.integrity, /^sha512-/);
});
test('unexpected files are rejected without exposing their content', async (t) => {
  await assert.rejects(
    auditArchive(await fixture(t, null, true)),
    (e) => !String(e).includes('synthetic-secret'),
  );
});
test('runtime and package metadata tampering are rejected', async (t) => {
  for (const target of ['src/index.js', 'package.json'])
    await assert.rejects(
      auditArchive(
        await fixture(t, (p, v) =>
          p === target
            ? v.replace(
                target === 'package.json' ? '0.1.1' : 'value=1',
                target === 'package.json' ? '0.1.2' : 'value=2',
              )
            : v,
        ),
      ),
    );
});
