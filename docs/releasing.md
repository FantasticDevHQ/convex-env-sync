# npm release procedure

The first release targets `@fantastic.dev/convex-env-sync@0.1.0` on public npmjs,
with dist-tag `latest`. Preparing this source does not establish publication.
CES-14 owns registry delivery and its independent acceptance. Keep release
records and command output in that PR, without credentials or private consumer
identifiers. Normal CI remains on UbiCloud.

## Preconditions

The owner has authorized the first npm publication. Before publishing, verify
that the authenticated npm account can publish in `@fantastic.dev`, all required
checks pass on the final source commit, and its independent acceptance review
passes. Use `npm whoami` and `npm org ls fantastic.dev --json` with approved
operator authentication. Stop on missing access; do not change account policy,
create a replacement scope or substitute another package name.

Use npm's supported login or an existing approved scoped publishing credential.
Keep credentials out of commands, logs, archive contents and source files. When
using 1Password, reuse one authorized terminal and inject references with `op run`;
do not copy passwords or tokens into temporary files. A browser/security-key or
current OTP challenge may require the account owner's interaction. Never weaken
2FA to complete a release.

This initial procedure is an operator release from a reviewed local checkout,
not an OIDC workflow. Record the actual machine, npm version and authentication
method in the release PR. npm trusted publishing currently does not support
self-hosted runners, including UbiCloud. See [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/)
and [provenance](https://docs.npmjs.com/generating-provenance-statements/).
No publishing runner exception or provenance is claimed by this procedure. A
future automated publisher requires its own reviewed configuration and any
explicit CI-provider exception; ordinary verification stays on UbiCloud.

## Pack the exact reviewed source

Use a clean checkout of the independently accepted commit. Record the full SHA
from `git rev-parse HEAD`; confirm `git status --porcelain` is empty. Do not pack
a moving branch or include subsequent unreviewed edits.

```sh
pnpm install --frozen-lockfile
pnpm check
release_artifacts="$(mktemp -d)"
pnpm pack --pack-destination "$release_artifacts"
release_archive="$release_artifacts/fantastic.dev-convex-env-sync-0.1.0.tgz"
tar -tzf "$release_archive"
npm publish "$release_archive" --dry-run --ignore-scripts --access public --tag latest --registry https://registry.npmjs.org/ --logs-max=0
```

Audit the archive and repeat the clean-consumer checks in [package.md](package.md).
The package's explicit file list excludes tooling, tests, state and release
records. Record the archive's SHA-512 integrity before publishing and compare it
with the registry artifact afterward. Do not put credentials in the archive or
commit the archive or evidence.

## Publish and verify

Query public registry metadata first. If version 0.1.0 already exists, inspect
its source and integrity; never overwrite or silently publish a different
version. A 404 only establishes absence, not publishing access. With the exact
reviewed archive and approved authentication, run:

```sh
npm publish "$release_archive" --ignore-scripts --access public --tag latest --registry https://registry.npmjs.org/ --logs-max=0
npm view @fantastic.dev/convex-env-sync@0.1.0 version dist.tarball dist.integrity --json --registry https://registry.npmjs.org/ --logs-max=0
npm view @fantastic.dev/convex-env-sync dist-tags --json --registry https://registry.npmjs.org/ --logs-max=0
```

If publishing fails or times out, recheck the registry before retrying. A failed
client process does not prove the write failed. Do not automatically retry a
publication or move an existing tag to hide a failure.

Download the exact public tarball without maintainer authentication, compare
its integrity with the reviewed archive, and install the exact registry version
in a new external consumer. Run the README's in-memory plan, all six non-Alchemy
imports without the peer, the installed offline CLI fixture, then the Alchemy
import with its pinned optional peer. Obtain independent registry acceptance,
including source SHA, version, integrity, public access, dist-tag, authentication
method and provenance limitation. Only then close CES-14. These checks do not
establish live production delivery.

## Release destinations

- Update repository release status and create an immutable `v0.1.0` source tag
  and GitHub release pointing to the accepted source after registry verification.
  Record the package link, integrity and supported scope in release notes.
- Update the organization profile's **From our toolkit** listing (CES-15).
- Update the Fantastic.Dev website's existing tool presentation (CES-16), with
  repository, documentation and npm links. Deployment needs its own authorization.
- Preserve the official logo and Fantastic.Dev attribution across public docs.
- Platform binaries, Homebrew and other registries are not release channels for
  this JavaScript package. No additional channel is currently configured.

Follow the shared [release destination checklist](https://github.com/FantasticDevHQ/oss-standards/blob/main/docs/release-checklist.md).
A tag, GitHub release, PR, tarball test or follow-up ticket does not prove npm or
website delivery. Verify each destination and retain honest limitations.
