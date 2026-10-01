import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore } from '../scripts/api/store';
import { createXService } from '../scripts/api/service';
import { createApiServer } from '../scripts/api/server';
import { failure, type XClient } from '../scripts/api/x-client';
import { createXJobs } from '../scripts/api/x-jobs';
import type { Server } from 'node:http';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function setup(test?: XClient['test'], readAccount?: XClient['readAccount']) {
  const dir = await mkdtemp(path.join(tmpdir(), 'x-api-')); let now = 1000;
  const store = await createStore(dir, randomBytes(32), () => now);
  const client: XClient = { readAccount: readAccount ?? (async () => ({ handle: 'demo', posts: [] })), test: test ?? (async token => { if (token === 'bad-token') throw failure('invalid_token', '凭据无效'); }) };
  const service = createXService(store, client, [{ handle: 'demo', slugs: ['demo'] }], () => now);
  service.setJobs(createXJobs(store, client, [{ handle: 'demo', slugs: ['demo'] }], () => now));
  const server = createApiServer(service, store, { origin: 'http://127.0.0.1:5173', production: false });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(dir, { recursive: true, force: true }); });
  const jar = { cookie: '' };
  async function request(method = 'GET', route = '/api/x/settings', body?: unknown, cookieJar = jar, origin = 'http://127.0.0.1:5173') {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookieJar.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const cookie = response.headers.get('set-cookie'); if (cookie) cookieJar.cookie = cookie.split(';')[0];
    const text = await response.text();
    return { status: response.status, data: JSON.parse(text), text, response };
  }
  return { request, jar, store, service, server: server as Server, advance: () => { now += 31_000; } };
}
describe('同源访客配置 API', () => {
  it('separates_two_visitors_and_never_returns_secrets', async () => {
    const { request } = await setup(); const a = { cookie: '' }; const b = { cookie: '' };
    await request('GET', '/api/x/settings', undefined, a); await request('GET', '/api/x/settings', undefined, b);
    const saved = await request('POST', '/api/x/settings', { token: 'valid-secret-A' }, a);
    expect(saved.data.data.configured).toBe(true);
    const own = await request('GET', '/api/x/settings', undefined, a);
    expect(own.data.data.configured).toBe(true); expect(own.text).not.toContain('valid-secret-A');
    expect((await request('GET', '/api/x/settings', undefined, b)).data.data.configured).toBe(false);
    expect(own.response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects_cross_origin_and_owner_parameter', async () => {
    const { request, jar } = await setup();
    expect((await request('POST', '/api/x/settings', { token: 'secret' }, jar, 'https://evil.example')).status).toBe(403);
    expect((await request('POST', '/api/x/settings', { token: 'secret', owner: 'someone-else' })).status).toBe(400);
    expect((await request('GET', '/api/x/settings?owner=other')).status).toBe(400);
    expect((await request('GET', '/api/missing')).status).toBe(404);
    expect((await request('POST', '/api/x/settings', { token: 'x'.repeat(9000) })).status).toBe(413);
  });
  it('saving_valid_token_automatically_starts_personal_fetch', async () => {
    const { request } = await setup();
    expect((await request('POST', '/api/x/settings', { token: 'valid-token' })).data.data.configured).toBe(true);
    let result;
    for (let i = 0; i < 50; i++) {
      result = (await request('GET', '/api/x/result')).data.data;
      if (result.task?.state !== 'running') break;
      await new Promise(r => setTimeout(r, 2));
    }
    expect(result.task.state).toBe('success'); expect(result.accounts[0].handle).toBe('demo');
  });
  it('invalid_save_preserves_previous_token_and_enforces_cooldown', async () => {
    const { request, jar, store, advance } = await setup();
    await request('POST', '/api/x/settings', { token: 'old-valid' });
    expect((await request('POST', '/api/x/settings', { token: 'bad-token' })).status).toBe(429);
    advance(); const rejected = await request('POST', '/api/x/settings', { token: 'bad-token' });
    expect(rejected.data.error.code).toBe('invalid_token');
    const id = jar.cookie.split('=')[1]; const record = (await store.read(id))!;
    expect(store.open(id, record.sealedToken!)).toBe('old-valid');
  });
  it('delete_during_test_does_not_restore_token', async () => {
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const blocked = new Promise<void>(r => { release = r; });
    const { request } = await setup(async () => { entered(); await blocked; });
    await request(); const pending = request('POST', '/api/x/settings', { token: 'pending-secret' });
    await started; await request('DELETE', '/api/x/settings'); release(); await pending;
    expect((await request()).data.data.configured).toBe(false);
  });
  it('replacement_when_capacity_is_full_preserves_cache_and_remains_retryable', async () => {
    let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
    let release!: () => void; const blocked = new Promise<void>(r => { release = r; });
    const { request, store, advance } = await setup(undefined, async (token, handle, signal) => {
      if (token === 'A-old') { entered(); await new Promise<void>((_, reject) => signal!.addEventListener('abort', () => setTimeout(() => reject(failure('interrupted', '取消')), 50), { once: true })); }
      if (token === 'B') await blocked;
      return { handle, posts: [] };
    });
    const a = { cookie: '' }; const b = { cookie: '' };
    await request('POST', '/api/x/settings', { token: 'A-old' }, a); await started;
    await request('POST', '/api/x/settings', { token: 'B' }, b);
    const id = a.cookie.split('=')[1]; const originalTime = '1970-01-01T00:00:00Z';
    await store.update(id, r => ({ ...r, result: { ...r.result, lastSuccessAt: originalTime, accounts: [{ handle: 'demo', slugs: ['demo'], checkedAt: originalTime, stale: false, posts: [] }] } }));
    advance(); const saved = await request('POST', '/api/x/settings', { token: 'A-new' }, a);
    await new Promise(r => setTimeout(r, 80)); release();
    expect(saved.data.data.testError.code).toBe('busy');
    const result = (await request('GET', '/api/x/result', undefined, a)).data.data;
    expect(result.task?.state).not.toBe('running');
    expect(result.lastSuccessAt).toBe(originalTime); expect(result.accounts[0].checkedAt).toBe(originalTime);
    for (let i = 0; i < 50; i++) {
      if ((await request('GET', '/api/x/result', undefined, b)).data.data.task?.state !== 'running') break;
      await new Promise(r => setTimeout(r, 2));
    }
    expect((await request('POST', '/api/x/refresh', {}, a)).status).toBe(200);
    expect((await request('GET', '/api/x/settings', undefined, a)).data.data.testError).toBeNull();
  });
  it('production_static_server_never_serves_private_files_or_api_html', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'x-static-')); const dist = path.join(dir, 'dist');
    await mkdir(dist); await writeFile(path.join(dist, 'index.html'), '<html>public</html>');
    const store = await createStore(path.join(dir, 'private'), randomBytes(32));
    const service = createXService(store, { test: async () => {}, readAccount: async () => ({ handle: 'demo', posts: [] }) }, []);
    const server = createApiServer(service, store, { origin: 'https://example.test', production: true, distDirectory: dist });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(dir, { recursive: true, force: true }); });
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    expect((await fetch(base + '/.private/secret')).status).toBe(403);
    expect((await fetch(base + '/@fs/private-key')).status).toBe(403);
    expect((await fetch(base + '/data/missing.json')).status).toBe(404);
    const api = await fetch(base + '/api/missing'); expect(api.status).toBe(404); expect(api.headers.get('content-type')).toContain('application/json');
    const status = await fetch(base + '/api/x/settings'); expect(status.headers.get('set-cookie')).toContain('; Secure');
  });
});
