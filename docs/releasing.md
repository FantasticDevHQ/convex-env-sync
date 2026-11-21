# npm releases

The initial public version is `@fantastic.dev/convex-env-sync@0.1.0`, published
through an authorized operator login and publishing 2FA. It has no npm provenance.
Future releases use the Better Stripe pattern described below. The first automated
patch also carries the corrected configuration-guide publication status; immutable
0.1.0 is never overwritten.

## Protected release PRs

Release Please reads conventional commits on main and maintains a version/changelog
PR. Its manifest starts at 0.1.0 and its bootstrap source is the immutable initial
release. Merging the release PR creates its tag and GitHub release, then publishes
in the same workflow run. A GITHUB_TOKEN-created tag does not start another run.

The existing FantasticDev npm releases GitHub App creates the PR so ordinary CI
runs. Its token is restricted to this repository. The owner explicitly approved
automatic merging of generated metadata-only releases after protected checks,
without a new per-version Linear ticket or Terra acceptance. Source-changing
implementation PRs keep normal ticketing and independent final-commit acceptance.

Release PRs meet the PR standard with no validator exemption. Whenever Release
Please creates or updates the release PR (`prs_created`), the workflow checks out
the release branch with the App token and `scripts/release/pr.mjs` writes the five
sections (`No ticket: automated release`, actual workflow identity and run link).
It then amends the release commit so its body ends with `No-ticket: automated
release`, skipping commits that already have it and keeping the author and
subject. Finally it force-pushes with a lease using the App token, so CI runs on
the new head. The body is written before the push so every check on the final
head sees it.

Before any of that, trusted-base validation checks the App identity,
same-repository branch, changed file inventory and both immutable file contents
through GitHub's API. Only a consistent version/manifest increase, appended
changelog and README version text qualify for auto-merge. Scripts, dependencies,
publishing settings, source files, deletions and renames are refused. Auto-merge
pins the amended head and relies on required branch protection; it never bypasses
checks.

## Verification and publishing

`Release PR` and `Verify release` run on `ubicloud-standard-2-ubuntu-2404`.
Verification checks the immutable tag, fetched-main ancestry, workflow commit,
package version, release manifest and changelog. It runs the full `pnpm check`,
including packed consumers, then packs once on UbiCloud and audits every archive
file against source. A receipt contains source SHA, version, tag and integrity.

The owner approved only `Publish` on GitHub-hosted `ubuntu-24.04`, because npm
trusted publishing and provenance do not support self-hosted runners. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[provenance](https://docs.npmjs.com/generating-provenance-statements/).
No other CI provider exception is granted.

The publisher downloads that same run's archive, checks its receipt and every
file against the tag (allowing only pnpm's omission of the maintainer
`packageManager` manifest field), then invokes native `npm publish --ignore-scripts
--provenance`. It does not install dependencies or rebuild the archive. OIDC
permission is scoped to this job and the `npm` environment. There is no long-lived
npm token or provider fallback. The workflow requires npm 11.5.1 or later.

Publishing checks the exact public version first. Existing identical contents
are verified without another write; mismatched immutable contents fail. A publish
is never retried automatically. Public metadata must then expose the reviewed
integrity and npm's SLSA provenance before the job reports success. Bounded
registry polling allows processing delay without another publication.

## One-time activation

Code alone does not establish activation. Before claiming success, verify:

- The existing organization `RELEASE_APP_CLIENT_ID` variable and selected-repository
  `RELEASE_APP_PRIVATE_KEY` secret cover this repository. Never copy or log the key.
- GitHub auto-merge is enabled while required PR verification stays enforced.
- The GitHub `npm` environment allows the intended main/tag release contexts.
- The package's npm trusted publisher is GitHub Actions, organization
  `FantasticDevHQ`, repository `convex-env-sync`, workflow filename `release.yml`,
  environment `npm`. Bind only that repository/workflow/environment.
- An actual generated release PR passes the required contexts and auto-merges,
  then the exact tag verifies on UbiCloud and publishes with GitHub OIDC/provenance.
- Record actual job runner labels/identities, public version, source, integrity,
  provenance and clean registry-consumer acceptance in the owning PR.

The initial operator authentication does not configure this publisher. Activation
remains incomplete until the external binding and real workflow run are verified.

## Recovery

Never move or overwrite an existing tag/version, disable provenance, or insert a
long-lived token when OIDC fails. Inspect the registry before any retry. A failed
client process can still have published the immutable artifact.

For an existing automated release tag, dispatch **at that exact tag ref**:

```sh
gh workflow run release.yml --ref v0.1.1 -f release_tag=v0.1.1
```

The workflow commit must equal the checked-out tag so provenance names the real
source. A dispatch from a later main commit targeting an older tag fails closed.
A manually pushed stable tag also goes through verification and publishing.
Existing matching registry contents are not published again. Initial operator
version 0.1.0 predates this workflow and is not a target for automated recovery.

## Release destinations

After registry acceptance, verify the repository README, package guides and GitHub
release; organization **From our toolkit** listing; and Fantastic.Dev project
catalog with repository, README and npm links. Follow the shared
[release destination checklist](https://github.com/FantasticDevHQ/oss-standards/blob/main/docs/release-checklist.md).
Use the existing website release permissions and check the actual deployed result
before claiming live delivery. Platform binaries, Homebrew and other registries
are not configured release channels for this JavaScript package.

Release evidence belongs in the PR and workflow output, never committed logs or
screenshots. Registry consumption is distinct from live provider delivery;
production integration still needs its own exact target and authorized acceptance.
