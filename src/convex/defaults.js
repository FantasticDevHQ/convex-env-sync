import * as Management from '@distilled.cloud/convex/management';
import { reconcile } from '../core/reconcile.js';
import { verifyValues } from '../core/verify.js';
import { runConvex } from './client.js';
import { applyDeployment, planDeployment, deploymentIdentity } from './deployment.js';

function validateTarget(target) {
  if (!target || ![target.teamId, target.projectId].every((id) => Number.isSafeInteger(id) && id > 0) ||
      !['dev', 'prod', 'preview'].includes(target.deploymentType)) throw new Error('Explicit project/type required');
  return { teamId: target.teamId, projectId: target.projectId, deploymentType: target.deploymentType };
}

export function defaultsIdentity(target) {
  return JSON.stringify({ kind: 'defaults', ...validateTarget(target) });
}

async function assertProject(target, run) {
  const info = await run(Management.getProject({ projectId: target.projectId }));
  if (info.id !== target.projectId || info.teamId !== target.teamId) throw new Error('Project identity mismatch');
}

async function observe(target, run) {
  const result = await run(Management.listDefaultEnvironmentVariables({ projectId: target.projectId, deploymentType: target.deploymentType }));
  if (!Array.isArray(result.items) || result.pagination?.hasMore !== false) throw new Error('Incomplete defaults observation');
  const record = Object.create(null);
  for (const row of result.items) {
    if (!row || typeof row.name !== 'string' || typeof row.value !== 'string' ||
        !Array.isArray(row.deploymentTypes) || row.deploymentTypes.length !== 1 || row.deploymentTypes[0] !== target.deploymentType ||
        Object.hasOwn(record, row.name)) throw new Error('Invalid defaults observation');
    record[row.name] = row.value;
  }
  return record;
}

function snapshotOwnership(ownership) {
  return ownership === undefined ? undefined : {
    target: ownership.target, managedNames: [...ownership.managedNames], syncVersion: ownership.syncVersion,
  };
}

async function prepare(input) {
  const target = validateTarget(input.target);
  const identity = defaultsIdentity(target);
  if (typeof input.token !== 'string' || !input.token.trim() ||
      (input.applyToExistingDeployments !== undefined && input.applyToExistingDeployments !== false)) throw new Error('Bulk overwrite is disabled');
  reconcile({ target: identity, desired: input.desired, actual: {}, ownership: input.ownership, deletions: input.deletions });
  const desired = { ...input.desired };
  const ownership = snapshotOwnership(input.ownership);
  const deletions = [...(input.deletions ?? [])];
  const token = input.token;
  const fetch = input.fetch ?? globalThis.fetch;
  const propagation = [];
  if (input.propagation !== undefined) {
    if (input.propagation?.authorized !== true || !Array.isArray(input.propagation.targets)) throw new Error('Explicit propagation authorization required');
    const seen = new Set();
    for (const entry of input.propagation.targets) {
      const destination = JSON.parse(deploymentIdentity(entry.target));
      if (destination.kind !== 'cloud' || destination.teamId !== target.teamId || destination.projectId !== target.projectId ||
          destination.deploymentType !== target.deploymentType || seen.has(destination.deploymentId)) throw new Error('Invalid propagation target');
      seen.add(destination.deploymentId);
      const overrides = entry.overrides ?? {};
      reconcile({ target: deploymentIdentity(destination), desired: overrides, actual: {} });
      const values = { ...desired, ...overrides };
      reconcile({ target: deploymentIdentity(destination), desired: values, actual: {}, ownership: entry.ownership, deletions: entry.deletions });
      propagation.push({ target: destination, desired: values, ownership: snapshotOwnership(entry.ownership), deletions: [...(entry.deletions ?? [])], token, fetch });
    }
  }
  const run = (operation) => runConvex(operation, { token, fetch });
  await assertProject(target, run);
  const actual = await observe(target, run);
  const planned = reconcile({ target: identity, desired, actual, ownership, deletions });
  const propagationPlans = [];
  // Preflight every explicit target before the first mutation of any kind.
  for (const entry of propagation) propagationPlans.push(await planDeployment(entry));
  return { target, identity, desired, actual, planned, propagation, propagationPlans, run };
}

export async function planDefaults(input) {
  try {
    const { identity, planned, propagationPlans } = await prepare(input);
    return { target: identity, ...planned, propagation: propagationPlans };
  } catch {
    throw new Error('Convex defaults plan failed');
  }
}

export async function applyDefaults(input) {
  try {
    const { target, identity, desired, actual, planned, propagation, run } = await prepare(input);
    const changes = planned.operations.map(({ name, operation }) => ({
      name, deploymentType: target.deploymentType,
      value: operation === 'set' ? desired[name] : null,
      applyToExistingDeployments: false,
    }));
    if (changes.length) {
      await assertProject(target, run);
      await run(Management.updateDefaultEnvironmentVariables({ projectId: target.projectId, changes }));
    }
    await assertProject(target, run);
    const readback = await observe(target, run);
    verifyValues({ identity, actual, desired, planned, readback });
    const results = [];
    for (const entry of propagation) results.push(await applyDeployment(entry));
    return { target: identity, ...planned, propagation: results, verified: true };
  } catch {
    throw new Error('Convex defaults apply or verification failed');
  }
}
