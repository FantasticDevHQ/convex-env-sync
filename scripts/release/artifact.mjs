import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

export function tagVersion(tag) {
  if (
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '') ||
    !tag.slice(1).split('.').map(Number).every(Number.isSafeInteger)
  )
    throw new Error('Exact stable vX.Y.Z tag required');
  return tag.slice(1);
}

export async function auditArchive({ root, archive, tag }) {
  const version = tagVersion(tag);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (
    pkg.name !== '@fantastic.dev/convex-env-sync' ||
    pkg.version !== version ||
    pkg.publishConfig?.access !== 'public' ||
    pkg.publishConfig?.provenance !== true ||
    pkg.publishConfig?.registry?.replace(/\/$/, '') !==
      'https://registry.npmjs.org' ||
    !Array.isArray(pkg.files)
  )
    throw new Error('Release package metadata mismatch');
  const expected = new Set([...pkg.files, 'package.json', 'src/README.md']);
  if (
    [...expected].some(
      (p) =>
        typeof p !== 'string' ||
        !/^[-a-zA-Z0-9_./]+$/.test(p) ||
        p.startsWith('/') ||
        p.split('/').some((v) => v === '.' || v === '..'),
    )
  )
    throw new Error('Explicit canonical release file paths required');
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((p) => !p.endsWith('/'));
  const names = entries.map((p) =>
    p.startsWith('package/') ? p.slice(8) : '',
  );
  if (
    new Set(names).size !== names.length ||
    names.length !== expected.size ||
    names.some((p) => !expected.has(p))
  )
    throw new Error('Archive contains unexpected or missing files');
  // Pinned pnpm omits only its maintainer packageManager field when packing.
  const packedManifest = { ...pkg };
  delete packedManifest.packageManager;
  for (const name of names) {
    const actual = execFileSync('tar', ['-xOf', archive, `package/${name}`], {
      maxBuffer: 2 ** 22,
    });
    const source = await readFile(join(root, name));
    if (
      name === 'package.json'
        ? !isDeepStrictEqual(JSON.parse(actual), packedManifest)
        : !actual.equals(source)
    )
      throw new Error('Archive differs from reviewed source');
  }
  return {
    name: pkg.name,
    version,
    tag,
    fileCount: names.length,
    integrity:
      'sha512-' +
      createHash('sha512')
        .update(await readFile(archive))
        .digest('base64'),
  };
}

export async function checkSource(
  root,
  tag,
  { workflowSha = process.env.GITHUB_SHA } = {},
) {
  const version = tagVersion(tag);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const source = git(['rev-parse', 'HEAD']);
  if (
    (workflowSha && workflowSha !== source) ||
    git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]) !== source
  )
    throw new Error('Checkout must match the immutable tag');
  git(['fetch', '--no-tags', 'origin', 'main']);
  git(['merge-base', '--is-ancestor', source, 'FETCH_HEAD']);
  if (git(['status', '--porcelain']))
    throw new Error('Release checkout must be clean');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(
    await readFile(join(root, '.release-please-manifest.json'), 'utf8'),
  );
  const notes = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  const escaped = version.replaceAll('.', '\\.');
  if (
    pkg.version !== version ||
    !isDeepStrictEqual(manifest, { '.': version }) ||
    !new RegExp(
      `^## (?:\\[${escaped}\\]|${escaped})(?:\\([^\\n)]*\\))?(?:[ \\n]|$)`,
      'm',
    ).test(notes)
  )
    throw new Error('Tag, version, manifest and changelog must agree');
  return { source, version };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const root = process.cwd(),
      tag = process.env.RELEASE_TAG;
    const { source, version } = await checkSource(root, tag);
    if (process.argv[2] === 'check')
      console.log(`Verified ${tag} at ${source}`);
    else if (process.argv[2] === 'pack') {
      const dir = process.env.RELEASE_ARTIFACT_DIR;
      if (!dir) throw new Error('Artifact directory required');
      await mkdir(dir, { recursive: true });
      execFileSync('pnpm', ['pack', '--pack-destination', dir], {
        cwd: root,
        stdio: 'inherit',
      });
      const archive = join(dir, `fantastic.dev-convex-env-sync-${version}.tgz`);
      const receipt = {
        ...(await auditArchive({ root, archive, tag })),
        source,
      };
      await writeFile(
        join(dir, 'receipt.json'),
        JSON.stringify(receipt) + '\n',
      );
      console.log(JSON.stringify(receipt));
    } else throw new Error('Use check or pack');
  } catch {
    console.error(
      'Release source/artifact verification failed; no publication was attempted.',
    );
    process.exitCode = 1;
  }
}
