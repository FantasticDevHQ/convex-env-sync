import { isDeepStrictEqual } from 'node:util';

const repository = 'FantasticDevHQ/convex-env-sync';
const allowed = new Set([
  'package.json',
  '.release-please-manifest.json',
  'CHANGELOG.md',
  'README.md',
]);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const version = (value) =>
  typeof value === 'string' && versionPattern.test(value)
    ? value.split('.').map(Number)
    : null;

export function isGeneratedRelease(pr) {
  return (
    pr.user?.login === 'fantasticdev-npm-releases[bot]' &&
    pr.user?.type === 'Bot' &&
    pr.base?.repo?.full_name === repository &&
    pr.head?.repo?.full_name === repository &&
    pr.base?.ref === 'main' &&
    /^release-please--branches--main(?:--|$)/.test(pr.head?.ref ?? '') &&
    /^[a-f0-9]{40}$/.test(pr.base?.sha ?? '') &&
    /^[a-f0-9]{40}$/.test(pr.head?.sha ?? '')
  );
}

/** Read-only exception for owner-approved, App-authored release metadata PRs. */
export async function generatedReleaseErrors(pr, changes, read) {
  if (!isGeneratedRelease(pr))
    return [
      'Only the approved release App and same-repository release branch qualify.',
    ];
  if (
    changes.length !== pr.changed_files ||
    changes.length > allowed.size ||
    new Set(changes.map((f) => f.filename)).size !== changes.length ||
    changes.some((f) => !allowed.has(f.filename) || f.status !== 'modified') ||
    !['package.json', '.release-please-manifest.json', 'CHANGELOG.md'].every(
      (p) => changes.some((f) => f.filename === p),
    )
  ) {
    return [
      'Generated release PRs may modify only version, manifest, changelog and README metadata.',
    ];
  }
  try {
    const files = [...allowed];
    const pairs = await Promise.all(
      files.map(async (p) => [
        p,
        await read(p, pr.base.sha),
        await read(p, pr.head.sha),
      ]),
    );
    if (
      pairs.some(
        ([, before, after]) =>
          typeof before !== 'string' ||
          typeof after !== 'string' ||
          before.length > 1_000_000 ||
          after.length > 1_000_000,
      )
    )
      throw Error('Invalid release content');
    const previous = Object.fromEntries(pairs.map(([p, b]) => [p, b]));
    const next = Object.fromEntries(pairs.map(([p, , a]) => [p, a]));
    const before = JSON.parse(previous['package.json']);
    const after = JSON.parse(next['package.json']);
    const oldVersion = version(before.version),
      newVersion = version(after.version);
    if (
      !oldVersion ||
      !newVersion ||
      ![...oldVersion, ...newVersion].every(Number.isSafeInteger)
    )
      throw Error('Invalid version');
    const firstDifference = newVersion.findIndex((n, i) => n !== oldVersion[i]);
    if (
      firstDifference < 0 ||
      newVersion[firstDifference] < oldVersion[firstDifference]
    )
      throw Error('Version must advance');
    if (pr.title !== `chore(main): release ${after.version}`)
      throw Error('Unexpected release title');
    if (
      before.name !== '@fantastic.dev/convex-env-sync' ||
      !isDeepStrictEqual({ ...before, version: after.version }, after)
    )
      throw Error('Package changes exceed version');
    if (
      !isDeepStrictEqual(
        JSON.parse(previous['.release-please-manifest.json']),
        { '.': before.version },
      ) ||
      !isDeepStrictEqual(JSON.parse(next['.release-please-manifest.json']), {
        '.': after.version,
      })
    )
      throw Error('Manifest mismatch');
    if (
      previous['README.md'].replaceAll(before.version, '<release-version>') !==
      next['README.md'].replaceAll(after.version, '<release-version>')
    )
      throw Error('README changes exceed version');
    const oldEntries = previous['CHANGELOG.md']
      .replace(/^# Changelog\r?\n+/, '')
      .trim();
    const changelog = next['CHANGELOG.md'].replaceAll('\r\n', '\n').trim();
    const escaped = after.version.replaceAll('.', '\\.');
    if (
      !oldEntries ||
      !changelog.endsWith(oldEntries) ||
      !new RegExp(
        `^## (?:\\[${escaped}\\]|${escaped})(?:\\([^\\n)]*\\))?(?:[ \\n]|$)`,
        'm',
      ).test(changelog)
    )
      throw Error('Changelog history or heading mismatch');
    return [];
  } catch {
    return [
      'Release metadata must contain only a consistent version increase and appended changelog entry; source changes require normal review.',
    ];
  }
}
