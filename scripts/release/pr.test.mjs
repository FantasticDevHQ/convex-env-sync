import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amendReleaseCommit,
  footer,
  prepareRelease,
  releaseBody,
  withTicketFooter,
} from './pr.mjs';
import { enforcePullRequestStandard } from '../enforce-pr-standard.mjs';
import { validatePullRequest } from '../pr-standard.mjs';
const repository = 'FantasticDevHQ/convex-env-sync';
function fixture({
  author = 'fantasticdev-npm-releases[bot]',
  source = false,
  message = `chore(main): release 0.1.1\n\n${footer}\n`,
} = {}) {
  const pr = {
    number: 7,
    state: 'open',
    user: { login: author, type: author.endsWith('[bot]') ? 'Bot' : 'User' },
    title: 'chore(main): release 0.1.1',
    body: 'Release notes',
    changed_files: source ? 5 : 4,
    base: { ref: 'main', sha: 'a'.repeat(40), repo: { full_name: repository } },
    head: {
      ref: 'release-please--branches--main',
      sha: 'b'.repeat(40),
      repo: { full_name: repository },
    },
  };
  const pkg = { name: '@fantastic.dev/convex-env-sync', version: '0.1.0' };
  const old = {
    'package.json': JSON.stringify(pkg),
    '.release-please-manifest.json': '{".":"0.1.0"}',
    'README.md': 'Version 0.1.0',
    'CHANGELOG.md': '# Changelog\n\n## 0.1.0\nInitial.',
  };
  const next = {
    'package.json': JSON.stringify({ ...pkg, version: '0.1.1' }),
    '.release-please-manifest.json': '{".":"0.1.1"}',
    'README.md': 'Version 0.1.1',
    'CHANGELOG.md':
      '# Changelog\n\n## [0.1.1](https://github.com/example/compare) (2026-11-14)\nNew notes.\n\n## 0.1.0\nInitial.',
  };
  const calls = [];
  const api = async (method, path, data) => {
    calls.push({ method, path, data });
    if (method === 'GET' && path === '/pulls/7') return pr;
    if (method === 'GET' && path.startsWith('/pulls/7/files'))
      return [...Object.keys(next), ...(source ? ['src/index.js'] : [])].map(
        (filename) => ({ filename, status: 'modified' }),
      );
    // Release commits need the footer: there is no bot exemption.
    if (method === 'GET' && path.startsWith('/pulls/7/commits'))
      return [{ sha: pr.head.sha, commit: { message }, parents: [{}] }];
    if (method === 'GET' && path.startsWith('/contents/')) {
      const [name, sha] = path.slice('/contents/'.length).split('?ref=');
      const text = (sha === pr.base.sha ? old : next)[name];
      return {
        type: 'file',
        encoding: 'base64',
        size: text.length,
        content: Buffer.from(text).toString('base64'),
      };
    }
    if (method === 'GET' && path.startsWith('/issues/7/comments')) return [];
    if (method === 'PATCH' && path === '/pulls/7') {
      pr.body = data.body;
      return pr;
    }
    if (
      method === 'POST' &&
      (/\/statuses\//.test(path) || path === '/issues/7/comments')
    )
      return {};
    throw Error('Unexpected fixture request ' + method + ' ' + path);
  };
  return { api, pr, calls };
}
const runUrl = `https://github.com/${repository}/actions/runs/123`;
const title = 'chore(main): release 0.1.1';
const footed = [{ sha: 'c'.repeat(40), message: `${title}\n\n${footer}\n` }];
const commit = (sha = 'b'.repeat(40), log = []) => ({
  message: async () => `${title}\n`,
  amend: async (pr) => {
    log.push(['amend', pr.head.ref]);
    return sha;
  },
});
test('generated PR meets the standard with or without a commit footer', () => {
  const body = releaseBody('0.1.1', 'Release notes', '123', runUrl);
  assert.deepEqual(validatePullRequest({ title, body }, [], footed), []);
  assert.match(body, /^No ticket: automated release$/m);
  assert.deepEqual(
    validatePullRequest({ title, body }, [], [{ sha: 'c'.repeat(40), message: title }]),
    [],
  );
  assert.equal(
    (
      releaseBody('0.1.1', body, '124', runUrl.replace('123', '124')).match(
        /## Summary/g,
      ) ?? []
    ).length,
    1,
  );
});
test('the enforcer validates release linkage in PR metadata', async () => {
  const unfooted = fixture({ message: title });
  unfooted.pr.body = releaseBody('0.1.1', 'Notes', '123', runUrl);
  assert.equal(
    await enforcePullRequestStandard({ api: unfooted.api, number: 7, runUrl }),
    true,
  );
  assert.equal(
    unfooted.calls.filter((c) => /\/statuses\//.test(c.path)).at(-1).data.state,
    'success',
  );
  const { api, pr } = fixture();
  pr.body = releaseBody('0.1.1', 'Notes', '123', runUrl);
  assert.equal(await enforcePullRequestStandard({ api, number: 7, runUrl }), true);
  pr.body = 'Only a release title';
  assert.equal(await enforcePullRequestStandard({ api, number: 7, runUrl }), false);
});
test('the footer is appended once', () => {
  assert.equal(withTicketFooter(`${title}\n`), `${title}\n\n${footer}\n`);
  assert.equal(withTicketFooter(footed[0].message), footed[0].message);
});
test('source-changing release bot cannot amend the branch or enable auto-merge', async () => {
  const { api } = fixture({ source: true });
  const log = [];
  let merged = false;
  await assert.rejects(
    prepareRelease({
      api,
      number: 7,
      runId: '123',
      runUrl,
      commit: commit(undefined, log),
      merge: async () => {
        merged = true;
      },
    }),
  );
  assert.equal(merged, false);
  assert.deepEqual(log, []);
});
test('auto-merge pins the amended head after the body edit and wraps notes without modifying code', async () => {
  const { api, pr, calls } = fixture();
  let args;
  const log = [];
  const amended = 'd'.repeat(40);
  const patched = () => log.push(['patch']);
  const tracked = async (method, path, data) => {
    if (method === 'PATCH') patched();
    return api(method, path, data);
  };
  assert.equal(
    await prepareRelease({
      api: tracked,
      number: 7,
      runId: '123',
      runUrl,
      commit: commit(amended, log),
      merge: async (a) => {
        args = a;
      },
    }),
    'auto-merge enabled',
  );
  assert.ok(args.includes('--auto'));
  assert.equal(args.at(-1), amended);
  assert.deepEqual(log, [['patch'], ['amend', pr.head.ref]]);
  assert.ok(pr.body.includes('## Evidence'));
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.ok(
    calls
      .filter((c) => c.method === 'PATCH')
      .every((c) => Object.keys(c.data).join() === 'body'),
  );
});

test('a stale-head rejection revalidates and pins the fresh head before retrying', async () => {
  const { api, pr } = fixture();
  const heads = [],
    pauses = [];
  const result = await prepareRelease({
    api,
    number: 7,
    runId: '123',
    runUrl,
    pause: async (ms) => pauses.push(ms),
    commit: { message: async () => title, amend: async (current) => current.head.sha },
    merge: async (args) => {
      heads.push(args.at(-1));
      if (heads.length === 1) {
        pr.head.sha = 'c'.repeat(40);
        throw Object.assign(new Error('stale'), {
          stderr: 'expected head oid does not match current head oid',
        });
      }
    },
  });
  assert.equal(result, 'auto-merge enabled');
  assert.deepEqual(heads, ['b'.repeat(40), 'c'.repeat(40)]);
  assert.deepEqual(pauses, [2000]);
});

test('amend adds the footer once, keeps author and subject, and force-pushes with a lease', async () => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'release-amend-'));
  const sh = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const branch = 'release-please--branches--main--components--@fantastic.dev/convex-env-sync';
  try {
    const remote = join(root, 'remote.git');
    const dir = join(root, 'work');
    sh(root, 'init', '-q', '--bare', remote);
    sh(root, 'init', '-q', '-b', 'main', dir);
    sh(dir, 'config', 'user.name', 'Fixture');
    sh(dir, 'config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n');
    sh(dir, 'add', '.');
    sh(dir, 'commit', '-q', '-m', 'docs: base');
    sh(dir, 'checkout', '-q', '-b', branch);
    writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## 0.1.1\n');
    sh(dir, 'add', '.');
    execFileSync('git', ['commit', '-q', '-m', title], {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'fantasticdev-npm-releases[bot]',
        GIT_AUTHOR_EMAIL: '1+bot@users.noreply.github.com',
        GIT_AUTHOR_DATE: '2026-11-21T07:11:46Z',
        GIT_COMMITTER_DATE: '2026-11-21T07:11:46Z',
      },
    });
    sh(dir, 'remote', 'add', 'origin', remote);
    sh(dir, 'push', '-q', 'origin', branch);
    const before = sh(dir, 'rev-parse', 'HEAD');
    const sha = await amendReleaseCommit({ dir, branch });
    assert.notEqual(sha, before);
    assert.equal(sh(remote, 'rev-parse', `refs/heads/${branch}`), sha);
    assert.equal(sh(dir, 'log', '-1', '--format=%B').trimEnd(), `${title}\n\n${footer}`);
    assert.equal(
      sh(dir, 'log', '-1', '--format=%an <%ae> %aI'),
      'fantasticdev-npm-releases[bot] <1+bot@users.noreply.github.com> 2026-11-21T07:11:46Z',
    );
    assert.equal(sh(dir, 'rev-parse', 'HEAD~1'), sh(dir, 'rev-parse', 'main'));
    assert.equal(sh(dir, 'rev-parse', 'HEAD^{tree}'), sh(dir, 'rev-parse', `${before}^{tree}`));
    assert.equal(await amendReleaseCommit({ dir, branch }), sha);
    // A newer candidate pushed meanwhile is never overwritten.
    sh(dir, 'reset', '-q', '--hard', before);
    sh(dir, 'commit', '-q', '--amend', '-m', 'chore(main): release 0.1.2');
    const newer = sh(dir, 'rev-parse', 'HEAD');
    sh(dir, 'push', '-q', '--force', 'origin', `${newer}:refs/heads/${branch}`);
    sh(dir, 'reset', '-q', '--hard', before);
    await assert.rejects(amendReleaseCommit({ dir, branch }), /stale info|rejected/);
    assert.equal(sh(remote, 'rev-parse', `refs/heads/${branch}`), newer);
    await assert.rejects(amendReleaseCommit({ dir, branch: 'main' }), /non-release branch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the Release workflow prepares the PR whenever Release Please creates or updates it', async () => {
  const { readFileSync } = await import('node:fs');
  const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  const step = workflow.slice(workflow.indexOf('- name: Validate generated metadata'));
  assert.match(step, /if: steps\.release-pr\.outputs\.prs_created == 'true'/);
  assert.match(step, /run: node scripts\/release\/pr\.mjs \.release-pr/);
  assert.match(
    workflow,
    /ref: \$\{\{ fromJSON\(steps\.release-pr\.outputs\.pr\)\.headBranchName \}\}\n\s+token: \$\{\{ steps\.app-token\.outputs\.token \}\}\n\s+path: \.release-pr/,
  );
});
