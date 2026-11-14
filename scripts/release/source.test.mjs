import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkSource } from './artifact.mjs';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'env-sync-release-source-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'source');
  execFileSync('git', ['init', '--bare', join(dir, 'remote')], {
    stdio: 'ignore',
  });
  execFileSync('git', ['init', '-b', 'main', root], { stdio: 'ignore' });
  const git = (args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Release fixture',
        '-c',
        'user.email=release@example.invalid',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  await writeFile(join(root, 'package.json'), '{"version":"0.1.1"}');
  await writeFile(join(root, '.release-please-manifest.json'), '{".":"0.1.1"}');
  await writeFile(
    join(root, 'CHANGELOG.md'),
    '# Changelog\n\n## 0.1.1\n\nNotes.\n',
  );
  git(['add', '.']);
  git(['commit', '-m', 'fixture']);
  git(['remote', 'add', 'origin', join(dir, 'remote')]);
  git(['push', 'origin', 'main']);
  git(['tag', 'v0.1.1']);
  return { root, git, source: git(['rev-parse', 'HEAD']) };
}
test('exact tagged source binds the workflow SHA and rejects dirty or mismatched metadata', async (t) => {
  const { root, git, source } = await fixture(t);
  assert.equal(
    (await checkSource(root, 'v0.1.1', { workflowSha: source })).source,
    source,
  );
  await assert.rejects(
    checkSource(root, 'v0.1.1', { workflowSha: 'f'.repeat(40) }),
  );
  git(['tag', 'v0.1.2']);
  await assert.rejects(checkSource(root, 'v0.1.2', { workflowSha: source }));
  await writeFile(join(root, 'unexpected.md'), 'dirty');
  await assert.rejects(checkSource(root, 'v0.1.1', { workflowSha: source }));
});
test('a tag outside fetched main is rejected even if the workflow SHA matches it', async (t) => {
  const { root, git } = await fixture(t);
  git(['checkout', '-b', 'topic']);
  await writeFile(join(root, 'unmerged.md'), 'unmerged');
  git(['add', '.']);
  git(['commit', '-m', 'unmerged']);
  git(['tag', '-f', 'v0.1.1']);
  await assert.rejects(
    checkSource(root, 'v0.1.1', { workflowSha: git(['rev-parse', 'HEAD']) }),
  );
});
