import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const packageJson = JSON.parse(read('package.json'));
assert.equal(packageJson.private, true, 'Scaffold must stay unpublished');
assert.equal(packageJson.license, 'MIT');
const worktree = JSON.parse(read('scripts/worktree.config.json'));
assert.equal(worktree.convex, false, 'This package has no application backend');
assert.equal(worktree.frontend, false, 'This package has no frontend');
const logo = readFileSync(new URL('../assets/fantastic-dev-logo.svg', import.meta.url));
assert.equal(createHash('sha256').update(logo).digest('hex'),
  '4869b13bae195ef7f934fb3a1dd2b37e86700ce33bf88f9c863e7597e20c2075');
for (const name of ['README.md', 'LICENSE', 'AGENTS.md', 'docs/architecture.md',
  'docs/configuration.md', 'docs/roadmap.md', 'docs/development.md',
  'docs/pull-request-standard.md', 'pnpm-lock.yaml']) {
  assert.ok(read(name).trim(), `${name} must exist and contain content`);
}
const tests = readdirSync(new URL('./worktree/', import.meta.url))
  .filter((name) => name.endsWith('.test.mts'))
  .map((name) => `scripts/worktree/${name}`);
tests.push('src/core/manifest.test.mjs', 'src/core/plan.test.mjs', 'src/sources/doppler.test.mjs');
tests.push('scripts/pr-standard.test.mjs', 'scripts/enforce-pr-standard.test.mjs');
const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
