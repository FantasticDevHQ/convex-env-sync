import test from 'node:test';
import assert from 'node:assert/strict';
import { generatedReleaseErrors, isGeneratedRelease } from './candidate.mjs';
const repository = 'FantasticDevHQ/convex-env-sync';
const pr = {
  user: { login: 'fantasticdev-npm-releases[bot]', type: 'Bot' },
  title: 'chore(main): release 0.1.1',
  changed_files: 4,
  base: { ref: 'main', sha: 'a'.repeat(40), repo: { full_name: repository } },
  head: {
    ref: 'release-please--branches--main--components--@fantastic.dev/convex-env-sync',
    sha: 'b'.repeat(40),
    repo: { full_name: repository },
  },
};
const pkg = {
  name: '@fantastic.dev/convex-env-sync',
  version: '0.1.0',
  scripts: { check: 'node scripts/check.mjs' },
  publishConfig: { access: 'public', provenance: true },
};
const base = {
  'package.json': JSON.stringify(pkg),
  '.release-please-manifest.json': JSON.stringify({ '.': '0.1.0' }),
  'README.md': 'Version 0.1.0\nInstall @package@0.1.0\n',
  'CHANGELOG.md': '# Changelog\n\n## 0.1.0\n\nInitial release.\n',
};
const head = {
  ...base,
  'package.json': JSON.stringify({ ...pkg, version: '0.1.1' }),
  '.release-please-manifest.json': JSON.stringify({ '.': '0.1.1' }),
  'README.md': 'Version 0.1.1\nInstall @package@0.1.1\n',
  'CHANGELOG.md':
    '# Changelog\n\n## 0.1.1\n\nNew notes.\n\n## 0.1.0\n\nInitial release.\n',
};
const changes = Object.keys(head).map((filename) => ({
  filename,
  status: 'modified',
}));
const check = async (p = pr, c = changes, h = head) =>
  generatedReleaseErrors(
    p,
    c,
    async (path, ref) => (ref === pr.base.sha ? base : h)[path],
  );
test('only the existing release App and same-repo generated branch qualify', () => {
  assert.equal(isGeneratedRelease(pr), true);
  for (const patch of [
    { user: { login: 'kellykampen', type: 'User' } },
    { head: { ...pr.head, repo: { full_name: 'attacker/fork' } } },
    { base: { ...pr.base, ref: 'other' } },
    { head: { ...pr.head, ref: 'feature/release' } },
  ])
    assert.equal(isGeneratedRelease({ ...pr, ...patch }), false);
});
test('generated version/changelog changes qualify without a per-version ticket', async () =>
  assert.deepEqual(await check(), []));
test('source additions, hidden files, renames and deletions fail before reading content', async () => {
  for (const c of [
    [...changes, { filename: 'src/index.js', status: 'modified' }],
    changes.slice(1),
    changes.map((f, i) => (i ? f : { ...f, status: 'renamed' })),
    changes.map((f, i) => (i ? f : { ...f, status: 'removed' })),
  ]) {
    let reads = 0;
    const errors = await generatedReleaseErrors(pr, c, async () => {
      reads++;
      throw Error('should not read');
    });
    assert.ok(errors.length);
    assert.equal(reads, 0);
  }
});
test('package scripts, dependencies, publishing settings and names cannot change', async () => {
  for (const patch of [
    { scripts: { postinstall: 'unexpected' } },
    { dependencies: { extra: '1.0.0' } },
    { publishConfig: { access: 'restricted' } },
    { name: '@another/package' },
  ])
    assert.ok(
      (
        await check(pr, changes, {
          ...head,
          'package.json': JSON.stringify({
            ...pkg,
            version: '0.1.1',
            ...patch,
          }),
        })
      ).length,
    );
});
test('versions must advance and agree with title and manifest', async () => {
  for (const [version, title, manifest] of [
    ['0.1.0', '0.1.0', '0.1.0'],
    ['0.0.9', '0.0.9', '0.0.9'],
    ['0.1.1', '0.1.2', '0.1.1'],
    ['0.1.1', '0.1.1', '0.1.2'],
    ['0.2.0-beta.1', '0.2.0-beta.1', '0.2.0-beta.1'],
  ])
    assert.ok(
      (
        await check(
          { ...pr, title: 'chore(main): release ' + title },
          changes,
          {
            ...head,
            'package.json': JSON.stringify({ ...pkg, version }),
            '.release-please-manifest.json': JSON.stringify({ '.': manifest }),
          },
        )
      ).length,
    );
});
test('README can only update the release version and old changelog entries remain intact', async () => {
  assert.ok(
    (
      await check(pr, changes, {
        ...head,
        'README.md': head['README.md'] + 'Extra instructions',
      })
    ).length,
  );
  assert.ok(
    (
      await check(pr, changes, {
        ...head,
        'CHANGELOG.md': '# Changelog\n\n## 0.1.1\nReplaced history',
      })
    ).length,
  );
});
test('invalid JSON and missing content fail without exposing input', async () => {
  const errors = await check(pr, changes, {
    ...head,
    'package.json': 'synthetic-credential-canary',
  });
  assert.ok(errors.length);
  assert.ok(!JSON.stringify(errors).includes('synthetic-credential'));
});

test('accepts the actual Release Please linked changelog heading', async () => {
  const changelog = head['CHANGELOG.md'].replace(
    '## 0.1.1',
    '## [0.1.1](https://github.com/FantasticDevHQ/convex-env-sync/compare/v0.1.0...v0.1.1) (2026-11-14)',
  );
  assert.deepEqual(
    await check(pr, changes, { ...head, 'CHANGELOG.md': changelog }),
    [],
  );
});
