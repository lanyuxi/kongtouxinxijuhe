import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createStore, emptyResult } from '../scripts/api/store';
import { createXJobs } from '../scripts/api/x-jobs';
import { failure, type XClient } from '../scripts/api/x-client';
import type { XTarget } from '../src/lib/x-api-types';

const dirs: string[] = []; afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function setup(readAccount: XClient['readAccount'], targets: XTarget[] = [{ handle: 'demo', slugs: ['demo'] }]) {
  const dir = await mkdtemp(path.join(tmpdir(), 'x-jobs-')); dirs.push(dir); let now = 1000;
  const store = await createStore(dir, randomBytes(32), () => now);
  const { id } = await store.resolveSession(undefined);
  await store.update(id, r => ({ ...r, sealedToken: store.seal(id, 'token'), testedAt: new Date(now).toISOString() }));
  const client = { readAccount, test: async () => {} };
  const jobs = createXJobs(store, client, targets, () => now);
  return { jobs, store, id, client, targets, advance: () => { now += 61_000; } };
}
async function finished(jobs: ReturnType<typeof createXJobs>, id: string) {
  for (let i = 0; i < 100; i++) { const result = await jobs.result(id); if (result.task?.state !== 'running') return result; await new Promise(r => setTimeout(r, 2)); }
  throw new Error('task did not finish');
}
const response = async (_token: string, handle: string) => ({ handle, posts: [{ id: '123', text: 'airdrop now', url: `https://x.com/${handle}/status/123`, publishedAt: null, airdropSignal: true }] });
describe('访客个人 X 抓取任务', () => {
  it('does_not_share_results_and_duplicate_click_returns_same_job', async () => {
    let release!: () => void; const blocked = new Promise<void>(r => { release = r; });
    const { jobs, store, id } = await setup(async (...args) => { await blocked; return response(args[0], args[1]); });
    const [a, b] = await Promise.all([jobs.start(id), jobs.start(id)]); expect(a.id).toBe(b.id);
    const other = await store.resolveSession(undefined); expect((await jobs.result(other.id)).accounts).toEqual([]);
    release(); expect((await finished(jobs, id)).accounts[0].posts[0].text).toBe('airdrop now');
  });
  it('deleted_or_replaced_config_rejects_old_results', async () => {
    let release!: () => void; const blocked = new Promise<void>(r => { release = r; });
    const { jobs, store, id } = await setup(async (...args) => { await blocked; return response(args[0], args[1]); });
    await jobs.start(id); jobs.invalidate(id);
    await store.update(id, r => ({ ...r, generation: randomUUID(), sealedToken: null, result: emptyResult() }));
    release(); await new Promise(r => setTimeout(r, 20));
    expect((await jobs.result(id)).accounts).toEqual([]);
  });
  it('partial_failure_preserves_failed_accounts_with_original_time', async () => {
    let failing = false;
    const { jobs, id, advance } = await setup(async (token, handle) => { if (failing && handle === 'other') throw failure('not_found', '账号未找到'); return response(token, handle); }, [{ handle: 'demo', slugs: ['a'] }, { handle: 'other', slugs: ['b'] }]);
    await jobs.start(id); const old = await finished(jobs, id);
    failing = true; advance(); await jobs.start(id); const next = await finished(jobs, id);
    expect(next.task?.state).toBe('partial');
    expect(next.accounts.find(a => a.handle === 'other')).toMatchObject({ stale: true, checkedAt: old.accounts[1].checkedAt });
  });
  it('all_failure_preserves_last_success_and_stops_on_auth_errors', async () => {
    let failing = false; let calls = 0;
    const { jobs, id, advance } = await setup(async (token, handle) => { calls++; if (failing) throw failure('invalid_token', '凭据无效'); return response(token, handle); }, [{ handle: 'demo', slugs: ['a'] }, { handle: 'other', slugs: ['b'] }]);
    await jobs.start(id); const old = await finished(jobs, id);
    failing = true; calls = 0; advance(); await jobs.start(id); const next = await finished(jobs, id);
    expect(next.task?.state).toBe('failed'); expect(next.lastSuccessAt).toBe(old.lastSuccessAt);
    expect(next.accounts.every(a => a.stale)).toBe(true); expect(calls).toBe(1);
  });
  it('restart_marks_running_job_interrupted', async () => {
    const { jobs, id, store } = await setup(response);
    await store.update(id, r => ({ ...r, result: { ...r.result, task: { id: 'old-job', state: 'running', checked: 0, total: 1, startedAt: 'old', finishedAt: null, failures: [] } } }));
    await jobs.recover(); const result = await jobs.result(id);
    expect(result.task?.state).toBe('failed'); expect(result.task?.failures[0].error.code).toBe('interrupted');
  });
  it('unchanged_posts_are_reported_without_claiming_new_content', async () => {
    const { jobs, id, advance } = await setup(response);
    await jobs.start(id); await finished(jobs, id); advance(); await jobs.start(id);
    expect((await finished(jobs, id)).task).toMatchObject({ dataChanged: false });
  });
  it('limits_global_concurrency_and_preserves_data_files', async () => {
    let release!: () => void; const blocked = new Promise<void>(r => { release = r; });
    const { jobs, id, store } = await setup(async (...args) => { await blocked; return response(args[0], args[1]); });
    const second = await store.resolveSession(undefined); const third = await store.resolveSession(undefined);
    for (const key of [second.id, third.id]) await store.update(key, r => ({ ...r, sealedToken: store.seal(key, 'token') }));
    await jobs.start(id); await jobs.start(second.id);
    await expect(jobs.start(third.id)).rejects.toMatchObject({ failure: { code: 'busy' } });
    release(); await finished(jobs, id); await finished(jobs, second.id);
  });
});
