import type { SourceHealth } from '../../src/lib/types';
import type { SourceAdapter } from '../fetch/types';
import { normalizeAll } from './normalize';
import type { NormalizedItem } from './normalize';
import type { LiveSnapshot } from './live';

/** 采集结果与接入状态分开记录；失败不删除上次成功记录。 */
export async function collectSources(adapters: SourceAdapter[], previous: SourceHealth[], now: string) {
  const health: SourceHealth[] = [];
  const rawItems: NormalizedItem[] = [];
  const snapshots: LiveSnapshot[] = [];
  for (const adapter of adapters) {
    const lastSuccess = previous.find(s => s.name === adapter.name)?.last_success_at;
    if (adapter.configured?.() === false) {
      health.push({ name: adapter.name, url: adapter.url, status: 'not_configured', ok: false,
        fetched: 0, checked_at: now, last_success_at: lastSuccess, error: '尚未配置来源访问凭据' });
      continue;
    }
    try {
      const normalized = normalizeAll(await adapter.fetch());
      if (normalized.length === 0) throw new Error('来源未返回有效条目，保留上次成功数据');
      rawItems.push(...normalized);
      snapshots.push({ fetched_at: now, source: adapter.name, source_url: adapter.url, items: normalized });
      health.push({ name: adapter.name, url: adapter.url, status: 'success', ok: true,
        fetched: normalized.length, checked_at: now, last_success_at: now });
    } catch (e) {
      health.push({ name: adapter.name, url: adapter.url, status: 'failed', ok: false,
        fetched: 0, checked_at: now, last_success_at: lastSuccess, error: (e as Error).message });
    }
  }
  return { health, rawItems, snapshots };
}
