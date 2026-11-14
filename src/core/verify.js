import { reconcile } from './reconcile.js';

/** Internal value comparison. Never returns or retains secret values. */
export function verifyValues({ identity, actual, desired, planned, readback }) {
  reconcile({ target: identity, desired, actual: readback, ownership: planned.ownership });
  const expected = { ...actual, ...desired };
  for (const { name, operation } of planned.operations) if (operation === 'delete') delete expected[name];
  if (Object.entries(expected).some(([name, value]) => !Object.hasOwn(readback, name) || readback[name] !== value) ||
      planned.operations.some(({ name, operation }) => operation === 'delete' && Object.hasOwn(readback, name))) {
    throw new Error('Readback mismatch');
  }
}
