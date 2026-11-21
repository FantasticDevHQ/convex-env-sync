import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRelease, releaseBody } from './pr.mjs';
import { enforcePullRequestStandard } from '../enforce-pr-standard.mjs';
import { validatePullRequest } from '../pr-standard.mjs';
const repository = 'FantasticDevHQ/convex-env-sync';
function fixture({
  author = 'fantasticdev-npm-releases[bot]',
  source = false,
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
    // Release Please commits carry no ticket; the exception must not need one.
    if (method === 'GET' && path.startsWith('/pulls/7/commits'))
      return [
        {
          sha: 'c'.repeat(40),
          commit: { message: 'chore(main): release 0.1.1' },
          parents: [{}],
        },
      ];
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
const releaseCommits = [{ sha: 'c'.repeat(40), message: 'chore(main): release 0.1.1' }];
test('generated PR keeps five sections and actual workflow identity without inventing a ticket', () => {
  const body = releaseBody('0.1.1', 'Release notes', '123', runUrl);
  assert.deepEqual(
    validatePullRequest({ title: 'chore(main): release 0.1.1', body }, [], releaseCommits, {
      ticketRequired: false,
    }),
    [],
  );
  assert.ok(
    validatePullRequest({ title: 'chore(main): release 0.1.1', body }, [], releaseCommits)
      .length,
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
test('normal author cannot opt into the ticket exception through PR metadata', async () => {
  const { api, pr, calls } = fixture({ author: 'kellykampen' });
  pr.ticketRequired = false;
  pr.body = releaseBody('0.1.1', 'Notes', '123', runUrl);
  assert.equal(
    await enforcePullRequestStandard({ api, number: 7, runUrl }),
    false,
  );
  assert.equal(
    calls.filter((c) => /\/statuses\//.test(c.path)).at(-1).data.state,
    'failure',
  );
  const comment = calls.find((c) => c.method === 'POST' && c.path === '/issues/7/comments');
  assert.match(comment.data.body, /has no ticket or issue reference/);
});
test('trusted metadata PR passes and still rejects missing required sections', async () => {
  const { api, pr } = fixture();
  pr.body = releaseBody('0.1.1', 'Notes', '123', runUrl);
  assert.equal(
    await enforcePullRequestStandard({ api, number: 7, runUrl }),
    true,
  );
  pr.body = 'Only a release title';
  assert.equal(
    await enforcePullRequestStandard({ api, number: 7, runUrl }),
    false,
  );
});
test('source-changing release bot cannot bypass standards or enable auto-merge', async () => {
  const { api, pr } = fixture({ source: true });
  pr.body = releaseBody('0.1.1', 'Notes', '123', runUrl);
  assert.equal(
    await enforcePullRequestStandard({ api, number: 7, runUrl }),
    false,
  );
  let merged = false;
  await assert.rejects(
    prepareRelease({
      api,
      number: 7,
      runId: '123',
      runUrl,
      merge: async () => {
        merged = true;
      },
    }),
  );
  assert.equal(merged, false);
});
test('auto-merge always pins the inspected head and wraps notes without modifying code', async () => {
  const { api, pr, calls } = fixture();
  let args;
  assert.equal(
    await prepareRelease({
      api,
      number: 7,
      runId: '123',
      runUrl,
      merge: async (a) => {
        args = a;
      },
    }),
    'auto-merge enabled',
  );
  assert.ok(args.includes('--auto'));
  assert.equal(args.at(-1), pr.head.sha);
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
