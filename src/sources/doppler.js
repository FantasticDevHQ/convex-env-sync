import * as Doppler from '@distilled.cloud/doppler';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import { selectValues } from '../core/manifest.js';

function computed(entry) {
  if (!entry || (entry.computedVisibility !== undefined && entry.computedVisibility !== 'unmasked')) {
    throw new Error('Selected source value is unavailable');
  }
  const value = Redacted.isRedacted(entry.computed) ? Redacted.value(entry.computed) : entry.computed;
  if (typeof value !== 'string') throw new Error('Selected source value is unavailable');
  return value;
}

/** Read one explicit config through Distilled. Returns secret-bearing in-memory values. */
export async function loadDoppler({ project, config, token, fetch = globalThis.fetch }) {
  try {
    if (![project, config, token].every((value) => typeof value === 'string' && value.trim().length > 0)) {
      throw new Error('Explicit source identity and credentials are required');
    }
    const response = await Effect.runPromise(Doppler.listSecrets({
      project, config, include_dynamic_secrets: false, include_managed_secrets: false,
    }).pipe(
      Doppler.Retry.none,
      Effect.provide(Doppler.fromApiKey({ apiKey: Redacted.make(token) })),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error', cache: 'no-store' }),
      Effect.timeout('30 seconds'),
    ));
    const secrets = response.secrets;
    if (!secrets || typeof secrets !== 'object') throw new Error('Source response is missing');
    const selection = {
      defaults: computed(secrets.SYNC_CONVEX_DEFAULT_KEYS),
      deployment: computed(secrets.SYNC_CONVEX_DEPLOYMENT_KEYS),
    };
    // Validate manifests before unwrapping application values. The proxy performs
    // selection-only reads and keeps unselected credentials out of the result.
    const source = new Proxy(secrets, {
      get: (entries, name) => computed(entries[name]),
    });
    return selectValues(source, selection);
  } catch {
    // SDK errors may hold request headers and raw response bodies. Do not retain
    // them as a cause or interpolate their messages into the public error.
    throw new Error('Doppler source could not be loaded');
  }
}
