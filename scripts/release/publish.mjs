import { readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { auditArchive, checkSource } from './artifact.mjs';

function verifiedMetadata(response, receipt) {
  if (response.status !== 200) return null;
  const value = response.body;
  if (
    value?.name !== receipt.name ||
    value.version !== receipt.version ||
    value.dist?.integrity !== receipt.integrity
  )
    throw new Error(
      'Immutable registry contents do not match the reviewed archive',
    );
  const attestation = value.dist.attestations;
  if (!attestation) return null;
  const url = new URL(attestation.url);
  if (
    url.origin !== 'https://registry.npmjs.org' ||
    url.username ||
    url.password ||
    attestation.provenance?.predicateType !== 'https://slsa.dev/provenance/v1'
  )
    throw new Error('Unexpected registry provenance metadata');
  return url.href;
}

/** Never retry a publish. Recovery verifies an existing immutable version first. */
export async function publishAndVerify({
  receipt,
  getMetadata,
  publish,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 120,
}) {
  const initial = await getMetadata();
  let published = false;
  if (initial.status === 404) {
    await publish();
    published = true;
  } else if (initial.status !== 200)
    throw new Error('Registry preflight failed; no publication attempted');
  else {
    const url = verifiedMetadata(initial, receipt);
    if (url) return { published, attestation: url };
  }
  for (let i = 0; i < attempts; i++) {
    const response = await getMetadata();
    if (
      response.status !== 200 &&
      response.status !== 404 &&
      response.status < 500
    )
      throw new Error('Public registry verification failed');
    const url = verifiedMetadata(response, receipt);
    if (url) return { published, attestation: url };
    if (i + 1 < attempts) await pause(5000);
  }
  throw new Error(
    'Publication/provenance is not publicly verified; recheck before recovery',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      process.env.GITHUB_REPOSITORY !== 'FantasticDevHQ/convex-env-sync' ||
      !process.env.ACTIONS_ID_TOKEN_REQUEST_URL ||
      !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
    )
      throw new Error('Approved trusted publishing runner required');
    const root = process.cwd(),
      tag = process.env.RELEASE_TAG,
      dir = process.env.RELEASE_ARTIFACT_DIR;
    if (!dir) throw new Error('Verified artifact directory required');
    const { source, version } = await checkSource(root, tag);
    const archive = join(dir, `fantastic.dev-convex-env-sync-${version}.tgz`);
    const receipt = JSON.parse(
      await readFile(join(dir, 'receipt.json'), 'utf8'),
    );
    const actual = { ...(await auditArchive({ root, archive, tag })), source };
    if (!isDeepStrictEqual(receipt, actual))
      throw new Error('Artifact receipt does not match the tagged source');
    const result = await publishAndVerify({
      receipt,
      getMetadata: async () => {
        const response = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(receipt.name)}/${version}`,
          {
            redirect: 'error',
            cache: 'no-store',
            headers: { 'cache-control': 'no-cache' },
            signal: AbortSignal.timeout(30_000),
          },
        );
        return {
          status: response.status,
          body: response.status === 200 ? await response.json() : undefined,
        };
      },
      publish: async () => {
        execFileSync(
          'npm',
          [
            'publish',
            archive,
            '--ignore-scripts',
            '--access',
            'public',
            '--tag',
            'latest',
            '--provenance',
            '--registry',
            'https://registry.npmjs.org/',
            '--logs-max=0',
          ],
          { cwd: root, stdio: 'inherit' },
        );
      },
    });
    const record = {
      ...receipt,
      ...result,
      authentication: 'npm OIDC trusted publishing',
      runner: process.env.RUNNER_NAME,
    };
    console.log(JSON.stringify(record));
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `## Verified npm release\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`,
      );
  } catch {
    console.error(
      'Trusted release failed; do not overwrite an existing version. Inspect the registry and use exact-tag recovery.',
    );
    process.exitCode = 1;
  }
}
