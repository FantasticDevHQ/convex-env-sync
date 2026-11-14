import { selectValues } from '../core/manifest.js';

function value(entry) {
  if (!entry || entry.secretValueHidden !== false || typeof entry.secretValue !== 'string') {
    throw new Error('Selected source value is unavailable');
  }
  return entry.secretValue;
}

/** Read via a caller-owned Infisical SDK client. Returns secret-bearing memory only. */
export async function loadInfisical({ client, projectId, environment, secretPath }) {
  try {
    if (![projectId, environment, secretPath].every((item) => typeof item === 'string' && item.trim()) ||
        !secretPath.startsWith('/')) throw new Error('Explicit source mapping is required');
    const response = await client.secrets().listSecrets({
      projectId, environment, secretPath,
      expandSecretReferences: true, viewSecretValue: true,
      includeImports: false, recursive: false, attachToProcessEnv: false,
    });
    if (!Array.isArray(response?.secrets)) throw new Error('Source response is missing');
    const entries = Object.create(null);
    for (const entry of response.secrets) {
      if (!entry || typeof entry.secretKey !== 'string' || Object.hasOwn(entries, entry.secretKey)) {
        throw new Error('Invalid or conflicting source entries');
      }
      entries[entry.secretKey] = entry;
    }
    const selection = {
      defaults: value(entries.SYNC_CONVEX_DEFAULT_KEYS),
      deployment: value(entries.SYNC_CONVEX_DEPLOYMENT_KEYS),
    };
    return selectValues(new Proxy(entries, { get: (items, key) => value(items[key]) }), selection);
  } catch {
    // Client exceptions can contain authenticated headers and response bodies.
    throw new Error('Infisical source could not be loaded');
  }
}
