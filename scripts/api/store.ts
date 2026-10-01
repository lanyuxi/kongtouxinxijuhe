import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { XFailure, XResult } from '../../src/lib/x-api-types';

export const SESSION_DAYS = 30;
export const COOKIE_NAME = 'airdrop_x';
export interface PrivateRecord {
  expiresAt: number; generation: string; sealedToken: string | null; testedAt: string | null;
  testError: XFailure | null; result: XResult;
}
export interface XStore {
  resolveSession(cookie: string | undefined): Promise<{ id: string; setCookie: string }>;
  read(id: string): Promise<PrivateRecord | null>;
  write(id: string, record: PrivateRecord): Promise<void>;
  update(id: string, mutate: (record: PrivateRecord) => PrivateRecord): Promise<PrivateRecord | null>;
  cleanupExpired(): Promise<void>;
  seal(id: string, token: string): string;
  open(id: string, sealed: string): string;
  records(): Promise<string[]>;
}
export function emptyResult(): XResult { return { task: null, lastSuccessAt: null, accounts: [] }; }
export function sealToken(token: string, key: Buffer, owner: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(owner));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
export function openToken(sealed: string, key: Buffer, owner: string): string {
  const bytes = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(owner)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

export async function createStore(directory: string, key: Buffer, now = () => Date.now()): Promise<XStore> {
  if (key.length !== 32) throw new Error('主密钥必须为 32 字节');
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  const locks = new Map<string, Promise<unknown>>();
  const validId = (id: string) => /^[a-f0-9]{64}$/.test(id);
  const filename = (id: string) => {
    if (!validId(id)) throw new Error('无效访客会话');
    return path.join(directory, `${createHash('sha256').update(id).digest('hex')}.json`);
  };
  const rawRead = async (id: string): Promise<PrivateRecord | null> => {
    try {
      const record = JSON.parse(await readFile(filename(id), 'utf8')) as PrivateRecord;
      if (!Number.isFinite(record.expiresAt) || record.expiresAt <= now()) { await rm(filename(id), { force: true }); return null; }
      if (!record.generation || !record.result || !Array.isArray(record.result.accounts)) return null;
      return record;
    } catch { return null; }
  };
  const rawWrite = async (id: string, record: PrivateRecord) => {
    const target = filename(id); const temp = `${target}.${randomUUID()}.tmp`;
    try { await writeFile(temp, JSON.stringify({ ...record, owner: id }), { mode: 0o600 }); await rename(temp, target); }
    finally { await rm(temp, { force: true }); }
  };
  const locked = async <T>(id: string, action: () => Promise<T>): Promise<T> => {
    const previous = locks.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action); locks.set(id, current);
    try { return await current; } finally { if (locks.get(id) === current) locks.delete(id); }
  };
  const store: XStore = {
    async resolveSession(cookie) {
      const matches = (cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${COOKIE_NAME}=`));
      let id = matches.length === 1 ? matches[0].slice(COOKIE_NAME.length + 1) : '';
      if (!validId(id) || !await store.read(id)) {
        id = randomBytes(32).toString('hex');
        await store.write(id, { expiresAt: now() + SESSION_DAYS * 86400_000, generation: randomUUID(), sealedToken: null, testedAt: null, testError: null, result: emptyResult() });
      } else {
        await store.update(id, r => ({ ...r, expiresAt: now() + SESSION_DAYS * 86400_000 }));
      }
      return { id, setCookie: `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}` };
    },
    read: id => locked(id, () => rawRead(id)),
    write: (id, record) => locked(id, () => rawWrite(id, record)),
    update: (id, mutate) => locked(id, async () => {
      const record = await rawRead(id); if (!record) return null;
      const next = mutate(record); await rawWrite(id, next); return next;
    }),
    async cleanupExpired() {
      for (const file of await readdir(directory)) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
        try {
          const data = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
          if (validId(data.owner)) await store.read(data.owner);
        } catch { /* 不删除无法确认归属的文件。 */ }
      }
    },
    seal: (id, token) => sealToken(token, key, id),
    open: (id, sealed) => openToken(sealed, key, id),
    async records() {
      const ids: string[] = [];
      for (const file of await readdir(directory)) {
        if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
        try { const data = JSON.parse(await readFile(path.join(directory, file), 'utf8')); if (validId(data.owner)) ids.push(data.owner); } catch { /* 非会话文件跳过。 */ }
      }
      return ids;
    },
  };
  return store;
}
