import * as Convex from '@distilled.cloud/convex';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';

/** Internal SDK runner. Raw results and errors must stay inside the writer. */
export function runConvex(operation, { token, deploymentUrl, fetch }) {
  const credentials = deploymentUrl
    ? Convex.fromDeployment({ url: deploymentUrl, token: Redacted.make(token) })
    : Convex.fromToken(Redacted.make(token));
  return Effect.runPromise(operation.pipe(
    Convex.Retry.none,
    Effect.provide(credentials),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error', cache: 'no-store' }),
    Effect.timeout('30 seconds'),
  ));
}
