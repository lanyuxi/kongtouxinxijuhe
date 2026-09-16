/**
 * P2-1｜「今日新增」的语义必须与用户的字面理解一致。
 *
 * 实测问题（上轮审查 P2-1）：
 *   ```
 *   新增 13 个（全部 discovered_at=今日）
 *   但它们的 sources 里带的是 2026-09-12 的 fetched_at
 *   → 说明这批不是「今天第一次出现」，而是「本轮才第一次进入筛选范围」
 *   ```
 *   旁证：`data/details/` 里有 56 个孤儿文件，正是被 prune 掉但文件残留的旧条目。
 *
 * 后果：「今日新增 13」这个磁贴数字，用户会理解成「今天出现了 13 个新空投」，
 * 实际是「今天有 13 个项目首次进入了当前筛选口径」。
 *
 * 修复原则：
 *   不猜、不装作知道「这个项目在世界上第一次出现的时间」——
 *   我们根本无从得知。而是**把口径说清楚**：
 *   1. 新增字段 `first_seen_at`：该项目**在本系统里**首次被记录的时间
 *      （从已有的 `created_at` 继承，历史数据不回填成今天）
 *   2. `discovered_at` 保留原语义（本轮首次进入数据集的时刻）
 *   3. 磁贴文案改为「今日新收录」，并在说明里写清口径
 */
import { describe, it, expect } from 'vitest';
import { markFirstSeen } from '../scripts/lib/first-seen';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';

const now = '2026-09-16T00:00:00.000Z';

function make(over: Partial<AirdropProject> = {}): AirdropProject {
  const base = toSkeleton({
    slug: 'demo',
    name: 'Demo',
    tagline: '测试',
    status: 'potential',
    categoryText: 'DeFi',
    chains: ['Ethereum'],
    sourceType: 'airdrop_aggregator',
    sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo/',
    fetchedAt: now,
    rawTitle: 'Demo',
  });
  return { ...base, ...over };
}

describe('P2-1 first_seen_at', () => {
  it('首次记录时间从 created_at 继承，不重置成今天', () => {
    const p = make({ created_at: '2026-09-01T00:00:00.000Z', first_seen_at: undefined });
    const out = markFirstSeen(p, new Date(now));
    expect(out.first_seen_at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('已有 first_seen_at 时保持不变（幂等）', () => {
    const p = make({ first_seen_at: '2026-08-01T00:00:00.000Z' });
    const a = markFirstSeen(p, new Date(now));
    const b = markFirstSeen(a, new Date('2026-09-20T00:00:00.000Z'));
    expect(b.first_seen_at).toBe('2026-08-01T00:00:00.000Z');
  });

  it('两者都无法确定时才用当前时间兜底', () => {
    const p = make({ created_at: undefined as unknown as string });
    const out = markFirstSeen(p, new Date(now));
    expect(out.first_seen_at).toBe(now);
  });

  it('discovered_at 语义不受影响（仍是本轮进入数据集的时刻）', () => {
    const p = make({ discovered_at: '2026-09-16T01:00:00.000Z' });
    const out = markFirstSeen(p, new Date(now));
    expect(out.discovered_at).toBe('2026-09-16T01:00:00.000Z');
  });
});

describe('P2-1 全量数据不变量', () => {
  it('每个项目都有 first_seen_at', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const missing = dataset.projects.filter((p) => !p.first_seen_at).map((p) => p.slug);
    expect(missing, `以下项目缺少 first_seen_at：${missing.join('、')}`).toEqual([]);
  });

  it('first_seen_at 不得晚于 discovered_at（首次记录不可能晚于本轮发现）', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const bad = dataset.projects.filter(
      (p) => new Date(p.first_seen_at!).getTime() > new Date(p.discovered_at).getTime() + 1000,
    );
    expect(
      bad.map((p) => `${p.slug}(${p.first_seen_at} > ${p.discovered_at})`),
      'first_seen_at 晚于 discovered_at，说明口径被写反了',
    ).toEqual([]);
  });
});
