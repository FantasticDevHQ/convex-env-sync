import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { validatePullRequest } from '../pr-standard.mjs';
import { generatedReleaseErrors, isGeneratedRelease } from './candidate.mjs';
import { githubApi, readContent, repository } from './github.mjs';
const execute = promisify(execFile);
const marker = '<!-- env-sync-generated-release -->';

// Release PRs meet the PR standard with no bot exemption, so the generated
// release commit carries this footer.
export const footer = 'No-ticket: automated release';
export const hasTicketFooter = (message) =>
  /^No-ticket:[ \t]*\S/m.test(message ?? '');

/** The commit message with the footer appended as its last line. */
export function withTicketFooter(message) {
  if (hasTicketFooter(message)) return message;
  return `${message.replace(/\s+$/, '')}\n\n${footer}\n`;
}

const git =
  (cwd, env = {}) =>
  async (args) =>
    (await execute('git', args, { cwd, env: { ...process.env, ...env } }))
      .stdout;

/**
 * Amend the head commit of the checked-out release branch so its body ends
 * with the footer (skipped when present), keeping author, dates and subject so
 * a rerun yields the same commit, then force-push it with a lease. Returns the
 * resulting head SHA.
 */
export async function amendReleaseCommit({
  dir,
  branch,
  remote = 'origin',
  env = {},
}) {
  if (!/^release-please--[\w@./-]+$/.test(branch ?? ''))
    throw new Error(`Refusing to amend a non-release branch: ${branch}`);
  const run = git(dir, env);
  const head = (await run(['rev-parse', 'HEAD'])).trim();
  const message = await run(['log', '-1', '--format=%B', head]);
  if (hasTicketFooter(message)) return head;
  const [name, email, authorDate, committerDate] = (
    await run(['log', '-1', '--format=%an%x00%ae%x00%aI%x00%cI', head])
  )
    .trim()
    .split('\0');
  const tmp = mkdtempSync(join(tmpdir(), 'release-commit-'));
  try {
    writeFileSync(join(tmp, 'message'), withTicketFooter(message));
    await git(dir, {
      ...env,
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_AUTHOR_DATE: authorDate,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
      GIT_COMMITTER_DATE: committerDate,
    })([
      'commit',
      '--amend',
      '--no-verify',
      '--allow-empty',
      '--cleanup=verbatim',
      '-F',
      join(tmp, 'message'),
    ]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const sha = (await run(['rev-parse', 'HEAD'])).trim();
  await run([
    'push',
    `--force-with-lease=refs/heads/${branch}:${head}`,
    remote,
    `${sha}:refs/heads/${branch}`,
  ]);
  return sha;
}

export function releaseBody(version, notes, runId, runUrl) {
  if (
    !/^[0-9]+$/.test(runId ?? '') ||
    !runUrl?.startsWith(`https://github.com/${repository}/actions/runs/`)
  )
    throw new Error('Actual release workflow identity is required');
  notes =
    notes
      .match(
        /<!-- release-notes:start -->([\s\S]*?)<!-- release-notes:end -->/,
      )?.[1]
      ?.trim() ?? notes;
  return `${marker}\n## Summary\n\nPrepare version ${version} through the owner-approved generated metadata release path.\n\nNo ticket: automated release\n\n## What\n\nUpdate only the version, release manifest, changelog and README version text.\n\n<!-- release-notes:start -->\n${notes}\n<!-- release-notes:end -->\n\n## Why\n\nDeliver accepted changes through a protected release PR, followed by exact-tag verification and trusted npm publication.\n\n## Evidence\n\nUI changes: No\n\n[Release workflow](${runUrl}) created and validated this generated PR. Required PR checks must pass before GitHub auto-merge can complete; this is not a publication claim.\n\n## Agent\n\n- Agent: Release Please / FantasticDev npm releases GitHub App\n- Session/thread ID: ${runId}\n- Session link: ${runUrl}\n\n## Acceptance checklist\n\n- [x] Generated changes are restricted to release metadata.\n- [x] Source changes remain subject to normal ticket and independent review gates.\n- [ ] Publish and verify the exact tagged artifact after protected checks and merge.\n`;
}

export async function prepareRelease({
  api,
  number,
  runId,
  runUrl,
  commit,
  merge = async (args) => execute('gh', args),
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('Generated release PR number required');
  for (let attempt = 0; attempt < 3; attempt++) {
    const pr = await api('GET', `/pulls/${number}`);
    if (pr.state === 'closed') return pr.merged ? 'merged' : 'closed';
    if (pr.state !== 'open' || !isGeneratedRelease(pr))
      throw new Error('Unexpected release PR identity');
    const files = await api('GET', `/pulls/${number}/files?per_page=100`);
    const errors = await generatedReleaseErrors(pr, files, (p, s) =>
      readContent(api, p, s),
    );
    if (errors.length) throw new Error(errors.join(' '));
    const version = pr.title.slice('chore(main): release '.length);
    const body = releaseBody(version, pr.body ?? '', runId, runUrl);
    const standard = validatePullRequest(
      { title: pr.title, body },
      files.map((file) => file.filename),
      [{ sha: pr.head.sha, message: withTicketFooter(await commit.message()) }],
    );
    if (standard.length) throw new Error(standard.join(' '));
    // Edit the body before pushing, so every check run on the final head sees
    // it; then add the commit footer and pin auto-merge to the amended head.
    await api('PATCH', `/pulls/${number}`, { body });
    const head = await commit.amend(pr);
    try {
      await merge([
        'pr',
        'merge',
        String(number),
        '--repo',
        repository,
        '--auto',
        '--squash',
        '--match-head-commit',
        head,
      ]);
      return 'auto-merge enabled';
    } catch (error) {
      if (
        attempt === 2 ||
        !/expected head oid does not match (?:the )?current head oid/i.test(
          typeof error.stderr === 'string' ? error.stderr : '',
        )
      )
        throw new Error('Could not enable protected release auto-merge');
      await pause(2000);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.env.GITHUB_REPOSITORY !== repository)
      throw new Error('Unexpected release repository');
    const pr = JSON.parse(process.env.RELEASE_PR ?? 'null');
    const checkout = process.argv[2];
    if (!checkout) throw new Error('Release branch checkout required');
    const runUrl = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    // The checkout dropped its credentials; pass the App token for this push only.
    const basic = Buffer.from(
      `x-access-token:${process.env.GH_TOKEN}`,
    ).toString('base64');
    const env = {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    };
    console.log(
      await prepareRelease({
        api: githubApi(),
        number: pr?.number,
        runId: process.env.GITHUB_RUN_ID,
        runUrl,
        commit: {
          message: () => git(checkout)(['log', '-1', '--format=%B', 'HEAD']),
          amend: (current) =>
            amendReleaseCommit({ dir: checkout, branch: current.head.ref, env }),
        },
      }),
    );
  } catch {
    console.error(
      'Generated release preparation failed; inspect identity, metadata and protected merge requirements.',
    );
    process.exitCode = 1;
  }
}
