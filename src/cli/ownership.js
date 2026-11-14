import { constants } from 'node:fs';
import { open, lstat, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assertKeys } from '../core/stages.js';
import { reconcile } from '../core/reconcile.js';

function metadata(value, identity) {
  assertKeys(value, ['target', 'managedNames', 'syncVersion']);
  reconcile({ target: identity, desired: {}, actual: {}, ownership: value });
  return { target: value.target, managedNames: [...value.managedNames].sort(), syncVersion: value.syncVersion };
}

export async function readOwnership(file, identity) {
  if (!file) return undefined;
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) throw new Error('Ownership must be a regular file');
    return metadata(JSON.parse(await handle.readFile('utf8')), identity);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  } finally {
    await handle?.close();
  }
}

async function persist(file, value, identity) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(metadata(value, identity))}\n`);
    await handle.sync();
    await handle.close();
    await rename(temporary, file);
  } finally {
    await handle.close();
    await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

/** Serialize one metadata file and release only the lock inode we created. */
export async function applyWithOwnership(file, identity, operation) {
  const lock = `${file}.lock`;
  const handle = await open(lock, 'wx', 0o600);
  const owned = await handle.stat();
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, target: identity }));
    const previous = await readOwnership(file, identity);
    const result = await operation(previous);
    if (result.verified !== true) throw new Error('Unverified ownership cannot be persisted');
    await persist(file, result.ownership, identity);
    return result;
  } finally {
    await handle.close();
    const current = await lstat(lock).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    if (current?.ino === owned.ino && current?.dev === owned.dev) await unlink(lock);
  }
}
