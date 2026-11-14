import { selectValues } from './manifest.js';

/** Read-only selection preview. This does not observe drift or authorize writes. */
export function plan({ source, selection }) {
  const selected = selectValues(source, selection);
  const operations = (values) => Object.keys(values).map((name) => ({ name, operation: 'set' }));
  return { defaults: operations(selected.defaults), deployment: operations(selected.deployment) };
}
