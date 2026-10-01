import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createStore, openToken, sealToken } from '../scripts/api/store';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function setup(clock = () => Date.now()) {
  const dir = await mkdtemp(path.join(tmpdir(), 'x-store-')); directories.push(dir);
  const key = randomBytes(32);
  return { dir, key, store: await createStore(dir, key, clock) };
}
describe('访客私有存储', () => {
  it('encrypts_without_plaintext_and_rejects_wrong_owner', async () => {
    const { store, dir, key } = await setup();
    const { id } = await store.resolveSession(undefined);
    const record = (await store.read(id))!;
    record.sealedToken = sealToken('sample-secret-token', key, id);
    await store.write(id, record);
    const file = (await readdir(dir)).find(f => f.endsWith('.json'))!;
    expect(await readFile(path.join(dir, file), 'utf8')).not.toContain('sample-secret-token');
    expect(openToken(record.sealedToken, key, id)).toBe('sample-secret-token');
    expect(() => openToken(record.sealedToken!, key, 'other-owner')).toThrow();
    expect(() => openToken(record.sealedToken!, randomBytes(32), id)).toThrow();
  });
  it('isolates_sessions_and_expires_after_30_days', async () => {
    let now = 1000;
    const { store } = await setup(() => now);
    const a = await store.resolveSession(undefined); const b = await store.resolveSession(undefined);
    expect(a.id).not.toBe(b.id);
    const record = (await store.read(a.id))!; record.testedAt = 'A'; await store.write(a.id, record);
    expect((await store.read(b.id))!.testedAt).toBeNull();
    expect((await store.resolveSession(a.setCookie.split(';')[0])).id).toBe(a.id);
    now += 30 * 86400_000 + 1;
    expect(await store.read(a.id)).toBeNull();
    expect((await store.resolveSession(a.setCookie.split(';')[0])).id).not.toBe(a.id);
  });
  it('atomic_write_and_permissions', async () => {
    const { dir, store } = await setup(); const { id } = await store.resolveSession(undefined);
    const record = (await store.read(id))!;
    await store.write(id, { ...record, testedAt: 'completed' });
    const files = await readdir(dir); expect(files).toHaveLength(1);
    const file = path.join(dir, files[0]);
    expect(JSON.parse(await readFile(file, 'utf8')).testedAt).toBe('completed');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });
  it('rejects_forged_duplicate_cookie_and_cleans_expired_records', async () => {
    let now = 1000; const { dir, store } = await setup(() => now);
    const a = await store.resolveSession(undefined);
    const cookie = a.setCookie.split(';')[0];
    expect((await store.resolveSession(`${cookie}; ${cookie}`)).id).not.toBe(a.id);
    expect((await store.resolveSession('airdrop_x=../../secret')).id).not.toBe(a.id);
    now += 31 * 86400_000; await store.cleanupExpired();
    expect(await readdir(dir)).toEqual([]);
  });
});
