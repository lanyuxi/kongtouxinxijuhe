import { randomUUID } from 'node:crypto';
import type { XAccountResult, XResult, XTarget, XTask } from '../../src/lib/x-api-types';
import { emptyResult, type XStore } from './store';
import { failure, safeFailure, uniqueTargets, type XClient } from './x-client';

export interface XJobs {
  start(id: string): Promise<XTask>; result(id: string): Promise<XResult>; invalidate(id: string): void; recover(): Promise<void>;
}
export function createXJobs(store: XStore, client: XClient, input: XTarget[], now = () => Date.now()): XJobs {
  const targets = uniqueTargets(input);
  const running = new Map<string, { task: XTask; controller: AbortController }>();
  const starting = new Map<string, Promise<XTask>>(); const lastStarts = new Map<string, number>();
  let active = 0;
  const run = async (id: string, generation: string, token: string, task: XTask, controller: AbortController) => {
    const successful: XAccountResult[] = [];
    const commit = (mutate: (r: XResult) => XResult) => store.update(id, r => !controller.signal.aborted && r.generation === generation ? { ...r, result: mutate(r.result) } : r);
    try {
      for (const target of targets) {
        if (controller.signal.aborted || (await store.read(id))?.generation !== generation) return;
        try {
          const result = await client.readAccount(token, target.handle, controller.signal);
          successful.push({ ...target, posts: result.posts, checkedAt: new Date(now()).toISOString(), stale: false });
        } catch (e) {
          const error = safeFailure(e); task.failures.push({ handle: target.handle, error });
          if (['invalid_token', 'forbidden', 'credits', 'rate_limit', 'interrupted'].includes(error.code)) { task.checked++; break; }
        }
        task.checked++;
        await commit(r => ({ ...r, task: structuredClone(task) }));
      }
      if (controller.signal.aborted) return;
      task.state = successful.length === targets.length ? 'success' : successful.length ? 'partial' : 'failed';
      task.finishedAt = new Date(now()).toISOString();
      await commit(previous => {
        const refreshed = new Map(successful.map(a => [a.handle, a]));
        const accounts = previous.accounts.map(a => refreshed.get(a.handle) ?? { ...a, stale: true });
        const oldHandles = new Set(accounts.map(a => a.handle));
        accounts.push(...successful.filter(a => !oldHandles.has(a.handle)));
        task.dataChanged = successful.some(a => JSON.stringify(a.posts) !== JSON.stringify(previous.accounts.find(old => old.handle === a.handle)?.posts));
        return { task: structuredClone(task), accounts, lastSuccessAt: successful.length ? task.finishedAt : previous.lastSuccessAt };
      });
    } catch {
      task.state = 'failed'; task.finishedAt = new Date(now()).toISOString();
      task.failures.push({ handle: '', error: { code: 'upstream', message: '抓取结果暂时无法保存，请稍后重试。' } });
      await commit(r => ({ ...r, task: structuredClone(task) })).catch(() => {});
    } finally {
      active--;
      if (running.get(id)?.task.id === task.id) running.delete(id);
    }
  };
  const jobs: XJobs = {
    start(id) {
      const existing = running.get(id); if (existing) return Promise.resolve(structuredClone(existing.task));
      const pending = starting.get(id); if (pending) return pending;
      const promise = (async () => {
        const record = await store.read(id);
        if (!record?.sealedToken) throw failure('not_configured', '请先在设置中保存并检测 X API。');
        if (record.testError && ['invalid_token', 'forbidden', 'credits'].includes(record.testError.code)) throw failure(record.testError.code, '当前凭据检测未通过，请在设置中修正后再抓取。');
        if (!targets.length) throw failure('not_found', '项目库暂无官方 X 账号。');
        if (now() - (lastStarts.get(id) ?? -Infinity) < 60_000) throw failure('rate_limit', '请等待 60 秒后再抓取，避免重复消耗 X API 额度。');
        if (active >= 2) throw failure('busy', '抓取服务当前忙碌，请稍后点击“更新我的 X 情报”。');
        let token: string;
        try { token = store.open(id, record.sealedToken); } catch { throw failure('not_configured', '已保存凭据无法解密，请重新配置。'); }
        const task: XTask = { id: randomUUID(), state: 'running', checked: 0, total: targets.length, startedAt: new Date(now()).toISOString(), finishedAt: null, failures: [] };
        const controller = new AbortController(); active++; running.set(id, { task, controller });
        try {
          let applied = false;
          await store.update(id, r => { if (r.generation !== record.generation) return r; applied = true; return { ...r, result: { ...r.result, task } }; });
          if (!applied || controller.signal.aborted) throw failure('interrupted', '配置已变更，任务未启动。');
        } catch (e) { active--; if (running.get(id)?.task.id === task.id) running.delete(id); throw e; }
        lastStarts.set(id, now());
        void run(id, record.generation, token, task, controller);
        return structuredClone(task);
      })();
      starting.set(id, promise);
      void promise.finally(() => { if (starting.get(id) === promise) starting.delete(id); }).catch(() => {});
      return promise;
    },
    result: async id => (await store.read(id))?.result ?? emptyResult(),
    invalidate(id) { const job = running.get(id); job?.controller.abort(); running.delete(id); lastStarts.delete(id); },
    async recover() {
      for (const id of await store.records()) await store.update(id, r => {
        if (r.result.task?.state !== 'running') return r;
        return { ...r, result: { ...r.result, task: { ...r.result.task, state: 'failed', finishedAt: new Date(now()).toISOString(), failures: [{ handle: '', error: { code: 'interrupted', message: '后台重启中断了上次任务，请重新抓取；已保留上次成功数据。' } }] } } };
      });
    },
  };
  return jobs;
}
