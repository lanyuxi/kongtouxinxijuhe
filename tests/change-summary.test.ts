/**
 * 「变更摘要要说人话」的回归测试（P1-4）。
 *
 * 背景：数据工具条原本只说「变更 5 个」，
 * 回访用户无法判断哪个项目变了、变成了什么 —— 计数携带不了任何决策信息。
 * 现在要求摘要必须落到「项目名 + 具体字段变化」。
 *
 * 同时锁住两个边界：
 *   1) 时间戳变化不算变化（否则每 10 分钟都会误报一片）
 *   2) 明细条数可限制（refresh-status.json 会被前端每 5 秒轮询，体积必须可控）
 */

import { describe, it, expect } from 'vitest';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';
import {
  describeDiff,
  describeDiffDetails,
  describeProjectChanges,
  diffProjects,
} from '../scripts/lib/change';

const T1 = '2026-09-13T10:00:00.000Z';
const T2 = '2026-09-13T10:10:00.000Z';

function makeProject(over: Partial<AirdropProject> = {}): AirdropProject {
  const base = toSkeleton({
    slug: 'demo',
    name: 'Demo Protocol',
    tagline: '一个测试项目',
    status: 'potential',
    categoryText: 'DeFi',
    chains: ['Ethereum'],
    sourceType: 'airdrop_aggregator',
    sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo/',
    officialUrl: 'https://demo.xyz',
    fetchedAt: T1,
    rawTitle: 'Demo Protocol',
  });
  return { ...base, ...over };
}

describe('项目级变更描述', () => {
  it('状态变化被翻译成中文，而不是内部枚举值', () => {
    const before = makeProject({ status: 'potential' });
    const after = makeProject({ status: 'claim_live' });
    expect(describeProjectChanges(before, after)[0]).toBe('状态：潜在空投 → 开放领取');
  });

  it('价值等级变化被识别', () => {
    const before = makeProject();
    const after = makeProject();
    after.scores = { ...after.scores, grade: 'A' };
    expect(describeProjectChanges(before, after)).toContain('价值等级：C → A');
  });

  it('风险等级变化被翻译成中文', () => {
    const before = makeProject();
    const after = makeProject();
    after.scores = { ...after.scores, risk: 'high' };
    expect(describeProjectChanges(before, after)).toContain('风险：中 → 高');
  });

  it('无法归类的变化回退为「内容有更新」，不产生空文案', () => {
    const changes = describeProjectChanges(makeProject(), makeProject());
    expect(changes).toEqual(['内容有更新']);
  });

  it('最多输出 3 条，避免摘要过长', () => {
    const before = makeProject();
    const after = makeProject();
    after.status = 'claim_live';
    after.scores = { ...after.scores, grade: 'A', risk: 'high', authenticity: 90, value: 90 };
    after.cost = { ...after.cost, capital_max_usd: 500 };
    expect(describeProjectChanges(before, after).length).toBeLessThanOrEqual(3);
  });
});

describe('变更摘要与明细', () => {
  it('摘要携带项目名与具体变化，而不是只有计数', () => {
    const before = [makeProject({ slug: 'a', name: 'Alpha', status: 'potential' })];
    const after = [makeProject({ slug: 'a', name: 'Alpha', status: 'claim_live' })];
    const summary = describeDiff(diffProjects(before, after));
    expect(summary).toContain('变更 1 个');
    expect(summary).toContain('Alpha');
    expect(summary).toContain('状态：潜在空投 → 开放领取');
  });

  it('新增 / 移除只给计数，不给明细（项目本身没有变化点可描述）', () => {
    const d = diffProjects([], [makeProject({ slug: 'new-one' })]);
    expect(describeDiff(d)).toBe('新增 1 个');
    expect(describeDiffDetails(d)).toEqual([]);
  });

  it('明细条数可被限制，避免状态文件体积失控', () => {
    const before = Array.from({ length: 10 }, (_, i) =>
      makeProject({ slug: `p${i}`, name: `P${i}`, status: 'potential' }),
    );
    const after = before.map((p) => makeProject({ ...p, status: 'claim_live' }));
    const d = diffProjects(before, after);
    expect(describeDiffDetails(d, 3)).toHaveLength(3);
    expect(describeDiffDetails(d, 5)).toHaveLength(5);
  });

  it('无变化时不输出明细', () => {
    const list = [makeProject()];
    const d = diffProjects(list, list);
    expect(describeDiff(d)).toBe('无实质变化');
    expect(describeDiffDetails(d)).toEqual([]);
  });

  it('仅时间戳变化不产生任何明细', () => {
    const before = [makeProject({ last_checked_at: T1 })];
    const after = [
      {
        ...before[0],
        last_checked_at: T2,
        sources: before[0].sources.map((s) => ({ ...s, fetched_at: T2 })),
      },
    ];
    const d = diffProjects(before, after);
    expect(d.changed).toBe(false);
    expect(describeDiff(d)).toBe('无实质变化');
  });

  it('明细顺序稳定，便于 diff 与人工阅读', () => {
    const before = [
      makeProject({ slug: 'b', name: 'Beta', status: 'potential' }),
      makeProject({ slug: 'a', name: 'Alpha', status: 'potential' }),
    ];
    const after = before.map((p) => makeProject({ ...p, status: 'claim_live' }));
    const d = diffProjects(before, after);
    expect(d.modifiedDetails.map((x) => x.slug)).toEqual(['a', 'b']);
  });
});
