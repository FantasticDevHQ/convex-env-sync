import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { generatedReleaseErrors, isGeneratedRelease } from './candidate.mjs';
import { githubApi, readContent, repository } from './github.mjs';
const execute = promisify(execFile);
const marker = '<!-- env-sync-generated-release -->';

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
  return `${marker}\n## Summary\n\nPrepare version ${version} through the owner-approved generated metadata release path.\n\n## What\n\nUpdate only the version, release manifest, changelog and README version text.\n\n<!-- release-notes:start -->\n${notes}\n<!-- release-notes:end -->\n\n## Why\n\nDeliver accepted changes through a protected release PR, followed by exact-tag verification and trusted npm publication.\n\n## Evidence\n\nUI changes: No\n\n[Release workflow](${runUrl}) created and validated this generated PR. Required PR checks must pass before GitHub auto-merge can complete; this is not a publication claim.\n\n## Agent\n\n- Agent: Release Please / FantasticDev npm releases GitHub App\n- Session/thread ID: ${runId}\n- Session link: ${runUrl}\n\n## Acceptance checklist\n\n- [x] Generated changes are restricted to release metadata.\n- [x] Source changes remain subject to normal ticket and independent review gates.\n- [ ] Publish and verify the exact tagged artifact after protected checks and merge.\n`;
}

export async function prepareRelease({
  api,
  number,
  runId,
  runUrl,
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
    await api('PATCH', `/pulls/${number}`, {
      body: releaseBody(version, pr.body ?? '', runId, runUrl),
    });
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
        pr.head.sha,
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
    const runUrl = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    console.log(
      await prepareRelease({
        api: githubApi(),
        number: pr?.number,
        runId: process.env.GITHUB_RUN_ID,
        runUrl,
      }),
    );
  } catch {
    console.error(
      'Generated release preparation failed; inspect identity, metadata and protected merge requirements.',
    );
    process.exitCode = 1;
  }
}
