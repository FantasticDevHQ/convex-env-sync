import { selectValues } from './manifest.js';
import { reconcile } from './reconcile.js';
import { applyDeployment, planDeployment, deploymentIdentity } from '../convex/deployment.js';
import { applyDefaults, planDefaults, defaultsIdentity } from '../convex/defaults.js';

export function assertKeys(value, allowed) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Invalid sync configuration');
}

function names(value = []) {
  if (!Array.isArray(value)) throw new Error('Invalid variable declarations');
  selectValues(Object.fromEntries(value.map((key) => [key, ''])), { defaults: JSON.stringify(value), deployment: '[]' });
  return [...value].sort();
}

export function resolveStage(stages, stage) {
  try {
    if (typeof stage !== 'string' || !stages || !Object.hasOwn(stages, stage)) throw new Error();
    const entry = stages[stage];
    assertKeys(entry, ['kind', 'source', 'target', 'overlaySource', 'overlayNames', 'generatedNames', 'deletions']);
    if (!['dev', 'prod', 'preview', 'local', 'project-defaults'].includes(entry.kind) ||
        typeof entry.source !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(entry.source)) throw new Error();
    const overlayNames = names(entry.overlayNames);
    const generatedNames = names(entry.generatedNames);
    const deletions = names(entry.deletions);
    if (entry.overlaySource !== undefined && (typeof entry.overlaySource !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(entry.overlaySource))) throw new Error();
    if (!entry.overlaySource && overlayNames.length) throw new Error();
    let target;
    if (entry.kind === 'project-defaults') {
      assertKeys(entry.target, ['teamId', 'projectId', 'deploymentType']);
      target = JSON.parse(defaultsIdentity(entry.target));
      delete target.kind;
      if (entry.overlaySource !== undefined || overlayNames.length || generatedNames.length) throw new Error();
    } else {
      assertKeys(entry.target, entry.kind === 'local' ? ['kind', 'url', 'instanceName', 'protectedNames'] : ['kind', 'url', 'teamId', 'projectId', 'deploymentId', 'deploymentType']);
      target = JSON.parse(deploymentIdentity(entry.target));
      if (entry.kind === 'local') {
        if (target.kind !== 'local') throw new Error();
        target.protectedNames = [...entry.target.protectedNames].sort();
      } else if (target.kind !== 'cloud' || target.deploymentType !== entry.kind) throw new Error();
    }
    return { kind: entry.kind, source: entry.source, target, ...(entry.overlaySource === undefined ? {} : { overlaySource: entry.overlaySource }), overlayNames, generatedNames, deletions };
  } catch {
    throw new Error('Invalid or unknown sync stage');
  }
}

function values(record) {
  reconcile({ target: 'selection-validation', desired: record, actual: {} });
  return { ...record };
}

function selection(selected) {
  assertKeys(selected, ['defaults', 'deployment']);
  const defaults = values(selected.defaults);
  const deployment = values(selected.deployment);
  if (Object.keys(defaults).some((key) => Object.hasOwn(deployment, key))) throw new Error('Conflicting source selection');
  return { defaults, deployment };
}

function declared(record, allowed) {
  const validated = values(record);
  if (JSON.stringify(Object.keys(validated).sort()) !== JSON.stringify(allowed)) throw new Error('Override declaration mismatch');
  return validated;
}

export function requireSources(runtime, mapping) {
  for (const name of [mapping.source, ...(mapping.overlaySource === undefined ? [] : [mapping.overlaySource])]) {
    if (!runtime?.sources || !Object.hasOwn(runtime.sources, name) || typeof runtime.sources[name] !== 'function') throw new Error('Missing source reference');
  }
  if (mapping.generatedNames.length && typeof runtime.generated !== 'function') throw new Error('Missing generated overrides');
  if (typeof runtime.getToken !== 'function') throw new Error('Missing credential loader');
}

/** Shared lifecycle/CLI pipeline. All secret-bearing data stays in this call. */
export async function runStage({ stages, stage, runtime, mode, ownership }) {
  try {
    if (!['plan', 'apply'].includes(mode)) throw new Error('Explicit operation required');
    const mapping = resolveStage(stages, stage);
    requireSources(runtime, mapping);
    const identity = mapping.kind === 'project-defaults' ? defaultsIdentity(mapping.target) : deploymentIdentity(mapping.target);
    reconcile({ target: identity, desired: {}, actual: {}, ownership });
    const prior = ownership === undefined ? undefined : { target: ownership.target, managedNames: [...ownership.managedNames], syncVersion: ownership.syncVersion };
    const loadSource = runtime.sources[mapping.source];
    const loadOverlay = mapping.overlaySource === undefined ? undefined : runtime.sources[mapping.overlaySource];
    const generated = runtime.generated;
    const getToken = runtime.getToken;
    const fetch = runtime.fetch;
    const source = selection(await loadSource());
    let desired = mapping.kind === 'project-defaults' ? source.defaults : { ...source.defaults, ...source.deployment };
    if (mapping.overlaySource !== undefined) {
      const overlay = selection(await loadOverlay());
      desired = { ...desired, ...declared({ ...overlay.defaults, ...overlay.deployment }, mapping.overlayNames) };
    }
    if (mapping.generatedNames.length) desired = { ...desired, ...declared(await generated({ stage, target: structuredClone(mapping.target) }), mapping.generatedNames) };
    // Revalidate complete composition before destination credentials are loaded.
    reconcile({ target: identity, desired, actual: {}, ownership: prior, deletions: mapping.deletions });
    const token = await getToken({ stage, target: structuredClone(mapping.target), kind: mapping.kind });
    const writer = mapping.kind === 'project-defaults'
      ? mode === 'plan' ? planDefaults : applyDefaults
      : mode === 'plan' ? planDeployment : applyDeployment;
    return await writer({ target: mapping.target, desired, token, ownership: prior, deletions: mapping.deletions, fetch });
  } catch {
    throw new Error('Environment sync failed');
  }
}
