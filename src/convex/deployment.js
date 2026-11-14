import * as Deployment from '@distilled.cloud/convex/deployment';
import { reconcile } from '../core/reconcile.js';
import { runConvex } from './client.js';

function validateTarget(target) {
  if (!target || !['cloud', 'local'].includes(target.kind)) throw new Error('Exact target required');
  const url = new URL(target.url);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid deployment URL');
  if (target.kind === 'cloud') {
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.convex\.cloud$/.test(url.hostname) || url.port ||
        ![target.teamId, target.projectId, target.deploymentId].every((id) => Number.isSafeInteger(id) && id > 0) ||
        !['dev', 'prod', 'preview'].includes(target.deploymentType)) throw new Error('Invalid cloud identity');
    return { kind: 'cloud', url: url.origin, teamId: target.teamId, projectId: target.projectId, deploymentId: target.deploymentId, deploymentType: target.deploymentType };
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port ||
      typeof target.instanceName !== 'string' || !/^anonymous-[a-zA-Z0-9_-]+$/.test(target.instanceName) ||
      !Array.isArray(target.protectedNames) || target.protectedNames.some((name) => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(name)) ||
      new Set(target.protectedNames).size !== target.protectedNames.length) throw new Error('Invalid anonymous local identity');
  return { kind: 'local', url: url.origin, instanceName: target.instanceName, protectedNames: [...target.protectedNames].sort() };
}

/** Non-secret identity used to scope ownership to one destination. */
export function deploymentIdentity(target) {
  const validated = validateTarget(target);
  if (validated.kind === 'local') {
    return JSON.stringify({ kind: validated.kind, url: validated.url, instanceName: validated.instanceName });
  }
  return JSON.stringify(validated);
}

async function assertIdentity(target, run, fetch) {
  if (target.kind === 'local') {
    // Distilled has no operation for this public local health endpoint. Do not
    // substitute it for authenticated SDK identity/reads below.
    const response = await fetch(`${target.url}/instance_name`, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || await response.text() !== target.instanceName) throw new Error('Local instance mismatch');
  }
  const info = await run(Deployment.getDeploymentInfo({}));
  if (target.kind === 'local') {
    if (info?.kind !== 'selfHosted') throw new Error('Expected anonymous local backend');
  } else if (info?.kind !== 'cloud' || info.id !== target.deploymentId || info.projectId !== target.projectId ||
      info.teamId !== target.teamId || info.deploymentType !== target.deploymentType) throw new Error('Cloud deployment mismatch');
}

async function prepare(input) {
  const target = validateTarget(input.target);
  const identity = deploymentIdentity(target);
  if (typeof input.token !== 'string' || !input.token.trim()) throw new Error('Explicit credentials required');
  // Validate synchronously before authentication, then snapshot secret inputs
  // so caller mutation during network awaits cannot alter the approved set.
  reconcile({ target: identity, desired: input.desired, actual: {}, ownership: input.ownership, deletions: input.deletions });
  const desired = { ...input.desired };
  const deletions = [...(input.deletions ?? [])];
  const ownership = input.ownership === undefined ? undefined : {
    target: input.ownership.target, managedNames: [...input.ownership.managedNames], syncVersion: input.ownership.syncVersion,
  };
  if (target.kind === 'local' && target.protectedNames.some((name) => Object.hasOwn(desired, name) || deletions.includes(name))) {
    throw new Error('Local generated identity variables are protected');
  }
  const token = input.token;
  const fetch = input.fetch ?? globalThis.fetch;
  const run = (operation) => runConvex(operation, { token, deploymentUrl: target.url, fetch });
  await assertIdentity(target, run, fetch);
  const actual = (await run(Deployment.listEnvironmentVariables({}))).environmentVariables;
  const planned = reconcile({ target: identity, desired, actual, ownership, deletions });
  return { target, identity, desired, actual, planned, run, fetch };
}

/** Observe the exact deployment; returns no secret values and makes no writes. */
export async function planDeployment(input) {
  try {
    const { identity, planned } = await prepare(input);
    return { target: identity, ...planned };
  } catch {
    throw new Error('Convex deployment plan failed');
  }
}

/** Apply one sparse SDK change set, then compare readback entirely in memory. */
export async function applyDeployment(input) {
  try {
    const { target, identity, desired, actual, planned, run, fetch } = await prepare(input);
    const changes = planned.operations.map(({ name, operation }) => operation === 'set' ? { name, value: desired[name] } : { name });
    if (changes.length) {
      await assertIdentity(target, run, fetch);
      await run(Deployment.updateEnvironmentVariables({ changes }));
    }
    await assertIdentity(target, run, fetch);
    const readback = (await run(Deployment.listEnvironmentVariables({}))).environmentVariables;
    // Validate the full response, even if no selected keys changed.
    reconcile({ target: identity, desired, actual: readback, ownership: planned.ownership });
    const expected = { ...actual, ...desired };
    for (const { name, operation } of planned.operations) if (operation === 'delete') delete expected[name];
    if (Object.entries(expected).some(([name, value]) => !Object.hasOwn(readback, name) || readback[name] !== value) ||
        planned.operations.some(({ name, operation }) => operation === 'delete' && Object.hasOwn(readback, name))) {
      throw new Error('Readback mismatch');
    }
    return { target: identity, ...planned, verified: true };
  } catch {
    // Never attach SDK errors, which may hold credentials and response bodies.
    throw new Error('Convex deployment apply or verification failed');
  }
}
