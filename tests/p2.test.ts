/**
 * P2 三项改进的单元测试：相对分位、风险说人话、今日待办。
 *
 * 这三块都在「把结论翻译给新手」这条链路上，出错方式很隐蔽：
 * 分位算歪会给出错误的参照系；风险文案给错动作会直接导致操作失误；
 * 待办判错会让用户去做不该做的事。因此全部锁进测试。
 */

import { describe, it, expect } from 'vitest';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';
import {
  buildPercentiles,
  buildScale,
  percentileBand,
  percentileNote,
  percentileOf,
  percentilePhrase,
} from '../src/lib/percentile';
import { RISK_EXPLAIN, explainRiskItem, riskExplain } from '../src/lib/risk';
import { buildTodos } from '../src/lib/todos';
import type { ProjectProgress } from '../src/lib/store';

const now = '2026-09-13T10:00:00.000Z';

function make(over: Partial<AirdropProject> = {}): AirdropProject {
  const base = toSkeleton({
    slug: 'demo',
    name: 'Demo',
    sourceType: 'airdrop_aggregator',
    sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo',
    title: 'Demo',
    url: 'https://airdrops.io/demo',
    fetchedAt: now,
  }) as AirdropProject;
  return { ...base, ...over };
}

function project(over: Partial<AirdropProject> & { slug: string }): AirdropProject {
  return make({
    ...over,
    scores: {
      ...make().scores,
      ...(over.scores ?? {}),
    } as AirdropProject['scores'],
  });
}

describe('相对分位', () => {
  it('与绝对分数严格单调：分数越高，分位不更低', () => {
    const scale = buildScale([10, 20, 30, 40, 50]);
    let prev = -1;
    for (const v of [10, 20, 30, 40, 50]) {
      const pct = percentileOf(v, scale)!;
      expect(pct).toBeGreaterThanOrEqual(prev);
      prev = pct;
    }
  });

  it('并列同分得到相同分位（不因顺序产生差异）', () => {
    const scale = buildScale([50, 50, 50, 10]);
    expect(percentileOf(50, scale)).toBe(percentileOf(50, scale));
    expect(percentileOf(50, scale)!).toBeGreaterThan(percentileOf(10, scale)!);
  });

  it('边界收敛：最低分与最高分都不会给出 0% / 100% 这种绝对断言', () => {
    const scale = buildScale([1, 2, 3, 4, 5]);
    expect(percentileOf(1, scale)).toBe(1);
    // 5 个样本里最高分「高于 4 个」= 80%，收敛后不会出现 100%
    expect(percentileOf(5, scale)).toBe(80);
  });

  it('样本不足 2 个时不返回分位（避免「超过 0% 的项目」这种废话）', () => {
    expect(percentileOf(50, buildScale([50]))).toBeNull();
    expect(percentileOf(50, buildScale([]))).toBeNull();
  });

  it('buildPercentiles 覆盖全部项目，且为空集时不编造数字', () => {
    const projects = [
      project({ slug: 'a', scores: { authenticity: 10, value: 90 } as never }),
      project({ slug: 'b', scores: { authenticity: 90, value: 10 } as never }),
      project({ slug: 'c', scores: { authenticity: 50, value: 50 } as never }),
    ];
    const p = buildPercentiles(projects);
    expect(p.authenticity.size).toBe(3);
    expect(p.value.size).toBe(3);
    // a 的真实性最低 → 分位最低；b 的最高 → 分位最高
    expect(p.authenticity.get('a')!).toBeLessThan(p.authenticity.get('b')!);
    // 价值与真实性方向相反，证明两条轴互不干扰
    expect(p.value.get('a')!).toBeGreaterThan(p.value.get('b')!);
    expect(buildPercentiles([]).authenticity.size).toBe(0);
  });

  it('文案必须写明「本批」，否则会被读成绝对评价', () => {
    expect(percentileNote(73, 188)).toContain('本批 188 个项目');
    expect(percentileNote(73, 188)).toContain('前 27%');
    expect(percentilePhrase(1)).toBe('前 99%');
    expect(percentileBand(90)).toBe('high');
    expect(percentileBand(50)).toBe('middle');
    expect(percentileBand(5)).toBe('low');
  });
});

describe('风险说人话', () => {
  it('四个等级都给出「这意味着」与「怎么办」，且动作各不相同', () => {
    const actions = (['low', 'medium', 'high', 'critical'] as const).map((r) => {
      const ex = RISK_EXPLAIN[r];
      expect(ex.means.length).toBeGreaterThan(0);
      expect(ex.action.length).toBeGreaterThan(0);
      return ex.action;
    });
    expect(new Set(actions).size).toBe(4);
  });

  it('极高风险必须是「立即停止」级，且明确不要连接钱包', () => {
    expect(RISK_EXPLAIN.critical.urgent).toBe(true);
    expect(RISK_EXPLAIN.critical.action).toContain('立即停止');
    expect(RISK_EXPLAIN.critical.means).toContain('助记词');
  });

  it('低风险不制造恐慌：不出现「立即停止」这类措辞', () => {
    expect(RISK_EXPLAIN.low.urgent).toBe(false);
    expect(RISK_EXPLAIN.low.action).not.toContain('立即停止');
  });

  it('未知等级回退到保守说明，而不是返回空', () => {
    const ex = riskExplain(undefined);
    expect(ex.action).toBe(RISK_EXPLAIN.medium.action);
  });

  it('按关键词把风险项归到对应动作', () => {
    expect(explainRiskItem('需要签署链上授权', 'high').action).toContain('revoke.cash');
    expect(explainRiskItem('页面可能索取助记词', 'critical').action).toContain('新钱包');
    expect(explainRiskItem('要求先转账才能领取', 'high').action).toContain('骗局');
    expect(explainRiskItem('测试网交互任务', 'low').action).toContain('官方水龙头');
    expect(explainRiskItem('与官网域名可能不一致', 'medium').action).toContain('防骗自查');
  });

  it('命中不了关键词时给出该等级的含义，而不是把原文复制一遍', () => {
    const text = '这是一个数据源没有归类过的描述';
    const ex = explainRiskItem(text, 'medium');
    expect(ex.means).toBe(RISK_EXPLAIN.medium.means);
    expect(ex.means).not.toBe(text);
    expect(ex.action).toBe(RISK_EXPLAIN.medium.action);
  });

  it('负向提醒（本身就在劝你别做）不被翻成「已发生」，避免自相矛盾', () => {
    const text = '任何要求输入助记词、私钥或恢复短语的页面都不可信。';
    const ex = explainRiskItem(text, 'medium');
    expect(ex.means).toBe(text);
    expect(ex.means).not.toContain('出现了索取');

    const text2 = '请勿使用主钱包参与实验性项目，避免资产集中风险。';
    const ex2 = explainRiskItem(text2, 'medium');
    expect(ex2.means).toBe(text2);
  });
});

describe('今日待办', () => {
  const progress = (over: Partial<ProjectProgress> = {}): ProjectProgress => ({
    status: 'saved',
    completed_steps: [],
    ...over,
  });

  it('开放领取且未完成 → 最高优先级', () => {
    const p = project({ slug: 'claim', status: 'claim_live' });
    const todos = buildTodos([p], ['claim'], { claim: progress() });
    expect(todos).toHaveLength(1);
    expect(todos[0].level).toBe('p0');
    expect(todos[0].href).toBe('#/project/claim');
  });

  it('不编造截止时间：文案里不出现「今天到期」这类无数据支撑的措辞', () => {
    const p = project({ slug: 'claim', status: 'claim_live' });
    const todos = buildTodos([p], ['claim'], { claim: progress() });
    expect(todos[0].reason).not.toMatch(/今天到期|截止到|剩余 \d+ 天/);
    expect(todos[0].reason).toContain('窗口关闭');
  });

  it('价值 S/A 且仍停留在已收藏 → 值得先看', () => {
    const p = project({ slug: 'a', scores: { grade: 'A' } as never });
    const todos = buildTodos([p], ['a'], { a: progress({ status: 'saved' }) });
    expect(todos[0].level).toBe('p1');
  });

  it('勾了一半教程 → 继续完成，并带上进度文案', () => {
    const p = project({
      slug: 'half',
      guide: [
        { step: 1, title: 'a' },
        { step: 2, title: 'b' },
        { step: 3, title: 'c' },
      ] as never,
    });
    const todos = buildTodos([p], ['half'], {
      half: progress({ status: 'doing', completed_steps: [1] }),
    });
    expect(todos[0].level).toBe('p2');
    expect(todos[0].progress).toBe('已完成 1 / 3 步');
  });

  it('高风险仍在关注列表 → 提示先复核风险', () => {
    const p = project({
      slug: 'risky',
      scores: { grade: 'C', risk: 'high' } as never,
    });
    const todos = buildTodos([p], ['risky'], { risky: progress() });
    expect(todos[0].level).toBe('p3');
  });

  it('已完成的项目不再产生待办', () => {
    const p = project({ slug: 'done', status: 'claim_live' });
    const todos = buildTodos([p], ['done'], { done: progress({ status: 'done' }) });
    expect(todos).toHaveLength(0);
  });

  it('未收藏的项目不进入待办；低价值且无动作的项目不制造无意义待办', () => {
    const p = project({ slug: 'low', scores: { grade: 'D', risk: 'low' } as never });
    expect(buildTodos([p], [], {})).toHaveLength(0);
    expect(buildTodos([p], ['low'], { low: progress() })).toHaveLength(0);
  });

  it('按优先级排序且数量受限，避免关注页被压垮', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      project({ slug: `p${i}`, status: 'claim_live' }),
    );
    const todos = buildTodos(
      items,
      items.map((p) => p.slug),
      Object.fromEntries(items.map((p) => [p.slug, progress()])),
      5,
    );
    expect(todos).toHaveLength(5);
    expect(todos.every((t) => t.level === 'p0')).toBe(true);
  });
});
