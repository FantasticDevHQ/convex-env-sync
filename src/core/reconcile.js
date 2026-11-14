import { selectValues } from './manifest.js';

function record(value) {
  if (!value || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((entry) => typeof entry.value !== 'string')) {
    throw new Error('A complete string-valued record is required');
  }
  return value;
}

function names(value) {
  if (!Array.isArray(value)) throw new Error('Variable names must be an array');
  // Reuse the manifest contract, including duplicate/reserved-name validation.
  selectValues(Object.fromEntries(value.map((name) => [name, ''])), {
    defaults: JSON.stringify(value), deployment: '[]',
  });
  return [...value].sort();
}

/** Compute sparse changes without mutating inputs or retaining secret values. */
export function reconcile({ target, desired, actual, ownership, deletions = [] }) {
  if (typeof target !== 'string' || !target.trim()) throw new Error('An exact target identity is required');
  record(desired);
  record(actual);
  const selected = names(Object.keys(desired));
  const removed = names(deletions);
  let previouslyOwned = [];
  if (ownership !== undefined) {
    if (!ownership || ownership.target !== target || ownership.syncVersion !== 1) {
      throw new Error('Ownership must match this target and supported sync version');
    }
    previouslyOwned = names(ownership.managedNames);
  }
  if (removed.some((name) => !previouslyOwned.includes(name) || Object.hasOwn(desired, name))) {
    throw new Error('Deletion requires prior ownership and an omitted desired value');
  }
  const operations = [
    ...selected.filter((name) => !Object.hasOwn(actual, name) || actual[name] !== desired[name])
      .map((name) => ({ name, operation: 'set' })),
    ...removed.filter((name) => Object.hasOwn(actual, name))
      .map((name) => ({ name, operation: 'delete' })),
  ].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    operations,
    // This is a candidate only. Persist after the writer verifies its readback.
    ownership: {
      target,
      managedNames: [...new Set([...previouslyOwned, ...selected])].filter((name) => !removed.includes(name)).sort(),
      syncVersion: 1,
    },
  };
}
