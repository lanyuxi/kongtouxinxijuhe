import { randomUUID } from 'node:crypto';
import type { XResult, XSettings, XTarget, XTask } from '../../src/lib/x-api-types';
import { emptyResult, type PrivateRecord, type XStore } from './store';
import { failure, safeFailure, type XClient } from './x-client';

export interface JobService {
  start(id: string): Promise<XTask>; result(id: string): Promise<XResult>; invalidate(id: string): void;
}
export interface XService {
  settings(id: string): Promise<XSettings>; save(id: string, token: string): Promise<XSettings>;
  test(id: string): Promise<XSettings>; remove(id: string): Promise<void>;
  refresh(id: string): Promise<XTask>; result(id: string): Promise<XResult>; setJobs(jobs: JobService): void;
}
export function createXService(store: XStore, client: XClient, targets: XTarget[], now = () => Date.now()): XService {
  const operations = new Map<string, string>(); const lastTests = new Map<string, number>();
  const testing = new Set<string>(); let jobs: JobService | undefined;
  const summary = (r: PrivateRecord | null): XSettings => ({ configured: !!r?.sealedToken, testedAt: r?.testedAt ?? null, testError: r?.testError ?? null, task: r?.result.task ?? null });
  const detect = async (id: string, token: string, save: boolean): Promise<XSettings> => {
    if (testing.has(id) || now() - (lastTests.get(id) ?? -Infinity) < 30_000) throw failure('rate_limit', '请等待 30 秒后再检测，避免重复消耗 X API 额度。');
    if (!targets.length) throw failure('not_found', '项目库暂无可用于检测的官方 X 账号。');
    const operation = randomUUID(); operations.set(id, operation); lastTests.set(id, now()); testing.add(id);
    const original = await store.read(id);
    if (!original) { testing.delete(id); throw failure('interrupted', '访客会话已过期，请重新配置。'); }
    try {
      await client.test(token, targets[0].handle);
      if (operations.get(id) !== operation) throw failure('interrupted', '配置已变更，本次检测结果已作废。');
      let applied = false;
      await store.update(id, r => {
        if (r.generation !== original.generation || operations.get(id) !== operation) return r;
        applied = true;
        return { ...r, generation: save ? randomUUID() : r.generation, sealedToken: save ? store.seal(id, token) : r.sealedToken, testedAt: new Date(now()).toISOString(), testError: null, result: save ? { ...r.result, task: null } : r.result };
      });
      if (!applied) throw failure('interrupted', '配置已变更或会话已过期，请重新操作。');
      if (save && jobs) {
        jobs.invalidate(id);
        try { await jobs.start(id); } catch (e) { await store.update(id, r => ({ ...r, testError: safeFailure(e) })); }
      }
      return summary(await store.read(id));
    } catch (e) {
      if (!save && operations.get(id) === operation) await store.update(id, r => r.generation === original.generation ? { ...r, testError: safeFailure(e) } : r);
      throw e;
    } finally { testing.delete(id); if (operations.get(id) === operation) operations.delete(id); }
  };
  return {
    settings: async id => summary(await store.read(id)),
    async save(id, token) {
      token = token.trim();
      if (!token || token.length > 4096 || /[\x00-\x20\x7f]/.test(token)) throw failure('invalid_input', '请粘贴完整的 Bearer Token，内容不能包含空格或换行。');
      return detect(id, token, true);
    },
    async test(id) {
      const r = await store.read(id); if (!r?.sealedToken) throw failure('not_configured', '请先配置 Bearer Token。');
      let token: string;
      try { token = store.open(id, r.sealedToken); } catch { throw failure('not_configured', '已保存凭据无法解密，请重新配置。'); }
      return detect(id, token, false);
    },
    async remove(id) {
      operations.set(id, randomUUID()); jobs?.invalidate(id);
      await store.update(id, r => ({ ...r, generation: randomUUID(), sealedToken: null, testedAt: null, testError: null, result: emptyResult() }));
    },
    async refresh(id) {
      if (!jobs) throw failure('busy', '抓取服务尚未就绪，请稍后重试。');
      const task = await jobs.start(id);
      await store.update(id, r => r.result.task?.id === task.id && r.testError && ['busy', 'interrupted'].includes(r.testError.code) ? { ...r, testError: null } : r);
      return task;
    },
    async result(id) { return jobs ? jobs.result(id) : (await store.read(id))?.result ?? emptyResult(); },
    setJobs(value) { jobs = value; },
  };
}
