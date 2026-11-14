import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertKeys, resolveStage, runStage } from '../core/stages.js';
import { deploymentIdentity } from '../convex/deployment.js';
import { defaultsIdentity } from '../convex/defaults.js';
import { readOwnership, applyWithOwnership } from './ownership.js';

const usage = 'Usage: convex-env-sync <plan|apply> --stage NAME --config FILE --runtime MODULE [--ownership FILE] [--approve]\nApply requires --approve and --ownership.\n';

function options(argv, cwd) {
  const [mode, ...args] = argv;
  if (!['plan', 'apply'].includes(mode)) throw new Error('Invalid command');
  const result = { mode };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--stage', '--config', '--runtime', '--ownership', '--approve'].includes(flag) || seen.has(flag)) throw new Error('Invalid flag');
    seen.add(flag);
    if (flag === '--approve') result.approve = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing flag value');
      result[flag.slice(2)] = value;
    }
  }
  if (!result.stage || !result.config || !result.runtime ||
      (mode === 'apply' && (!result.approve || !result.ownership))) throw new Error('Missing required input');
  for (const key of ['config', 'runtime', 'ownership']) if (result[key]) result[key] = resolve(cwd, result[key]);
  return result;
}

/** CLI orchestration. Output is redacted JSON; errors never include raw causes. */
export async function runCli(argv, { cwd = process.cwd(), writeOut = (text) => process.stdout.write(text), writeError = (text) => process.stderr.write(text) } = {}) {
  if (argv.length === 1 && argv[0] === '--help') { writeOut(usage); return 0; }
  let parsed;
  let mapping;
  try {
    parsed = options(argv, cwd);
    const config = JSON.parse(await readFile(parsed.config, 'utf8'));
    assertKeys(config, ['stages']);
    mapping = resolveStage(config.stages, parsed.stage);
  } catch {
    writeError(`Invalid command or stage configuration.\n${usage}`);
    return 2;
  }
  try {
    const identity = mapping.kind === 'project-defaults' ? defaultsIdentity(mapping.target) : deploymentIdentity(mapping.target);
    const execute = async (ownership) => {
      // No runtime module, factory or credential callback runs until the static
      // stage and any prior ownership have been validated.
      const module = await import(pathToFileURL(parsed.runtime).href);
      if (typeof module.createRuntime !== 'function') throw new Error('Missing runtime factory');
      const runtime = await module.createRuntime({ stage: parsed.stage, kind: mapping.kind, target: structuredClone(mapping.target), mode: parsed.mode });
      return runStage({ stages: { [parsed.stage]: mapping }, stage: parsed.stage, runtime, mode: parsed.mode, ownership });
    };
    const result = parsed.mode === 'apply'
      ? await applyWithOwnership(parsed.ownership, identity, execute)
      : await execute(await readOwnership(parsed.ownership, identity));
    writeOut(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    writeError('Environment sync failed. Run plan before retrying apply.\n');
    return 1;
  }
}
