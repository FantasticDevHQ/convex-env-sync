import test from 'node:test';
import assert from 'node:assert/strict';
import { publishAndVerify } from './publish.mjs';
const receipt = {
  name: '@fantastic.dev/convex-env-sync',
  version: '0.1.1',
  integrity: 'sha512-reviewed',
};
const ready = {
  status: 200,
  body: {
    name: receipt.name,
    version: receipt.version,
    dist: {
      integrity: receipt.integrity,
      attestations: {
        url: 'https://registry.npmjs.org/-/npm/v1/attestations/test',
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
      },
    },
  },
};
test('publish once then wait for public registry integrity/provenance without another write', async () => {
  let writes = 0,
    reads = 0;
  const responses = [
    { status: 404 },
    { status: 404 },
    {
      status: 200,
      body: { ...ready.body, dist: { integrity: receipt.integrity } },
    },
    ready,
  ];
  const result = await publishAndVerify({
    receipt,
    getMetadata: async () => {
      reads++;
      return responses.shift();
    },
    publish: async () => {
      writes++;
    },
    pause: async () => {},
    attempts: 4,
  });
  assert.equal(writes, 1);
  assert.equal(reads, 4);
  assert.equal(result.published, true);
});
test('existing identical version is verified without republishing', async () => {
  let writes = 0;
  const result = await publishAndVerify({
    receipt,
    getMetadata: async () => ready,
    publish: async () => {
      writes++;
    },
    pause: async () => {},
  });
  assert.equal(result.published, false);
  assert.equal(writes, 0);
});
test('different immutable registry contents and unknown preflight states fail without writes', async () => {
  for (const response of [
    { status: 403 },
    { status: 500 },
    {
      status: 200,
      body: { ...ready.body, dist: { integrity: 'sha512-other' } },
    },
  ]) {
    let writes = 0;
    await assert.rejects(
      publishAndVerify({
        receipt,
        getMetadata: async () => response,
        publish: async () => {
          writes++;
        },
        pause: async () => {},
      }),
    );
    assert.equal(writes, 0);
  }
});
test('failed publication is not retried and absent provenance does not pass verification', async () => {
  let writes = 0;
  await assert.rejects(
    publishAndVerify({
      receipt,
      getMetadata: async () => ({ status: 404 }),
      publish: async () => {
        writes++;
        throw Error('failed');
      },
      pause: async () => {},
    }),
  );
  assert.equal(writes, 1);
  await assert.rejects(
    publishAndVerify({
      receipt,
      getMetadata: async () => ({
        status: 200,
        body: { ...ready.body, dist: { integrity: receipt.integrity } },
      }),
      publish: async () => {
        throw Error('must not publish');
      },
      pause: async () => {},
      attempts: 2,
    }),
  );
});
