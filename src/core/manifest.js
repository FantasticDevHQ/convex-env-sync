const forbidden = /^(?:DOPPLER_|INFISICAL_|CONVEX_|SYNC_CONVEX_)/;

function manifest(value) {
  let names;
  try {
    if (typeof value !== 'string') throw new Error();
    names = JSON.parse(value);
  } catch {
    throw new Error('Manifest must be a JSON array of variable names');
  }
  if (!Array.isArray(names) || names.some((name) =>
    typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(name) || forbidden.test(name))) {
    throw new Error('Manifest contains an invalid or reserved variable name');
  }
  if (new Set(names).size !== names.length) throw new Error('Manifest contains duplicate names');
  return names.sort();
}

/** Select application values in memory. Errors never include source data. */
export function selectValues(source, selection) {
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      !selection || typeof selection !== 'object') throw new Error('Invalid selection input');
  const defaults = manifest(selection.defaults);
  const deployment = manifest(selection.deployment);
  if (defaults.some((name) => deployment.includes(name))) {
    throw new Error('Defaults and deployment selections overlap');
  }
  const pick = (names) => Object.fromEntries(names.map((name) => {
    if (!Object.hasOwn(source, name) || typeof source[name] !== 'string') {
      throw new Error('A selected value is missing or is not a string');
    }
    return [name, source[name]];
  }));
  return { defaults: pick(defaults), deployment: pick(deployment) };
}
