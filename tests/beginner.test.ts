/**
 * 新手友好筛选 + 教程来源标注 + 首访引导的单元测试。
 *
 * 这三块都是 P0 修复项，共同点是「用户看到什么」直接取决于数据判定，
 * 因此必须有测试锁住边界，避免后续调整阈值时悄悄失效。
 */

import { describe, it, expect } from 'vitest';
import type { AirdropProject, GuideStep } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';
import { buildGuide, buildGuideAndCost } from '../scripts/lib/guide';
import { beginnerVerdict, isBeginnerFriendly, countBeginnerFriendly, BEGINNER_RULES } from '../src/lib/beginner';
import { filterProjects, DEFAULT_FILTERS, applyCostBucket } from '../src/lib/filter';
import { SAFETY_LINES, ONBOARDING_VERSION, shouldShowOnboarding } from '../src/components/Onboarding';

const now = '2026-09-13T10:00:00.000Z';

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
    fetchedAt: now,
    rawTitle: 'Demo Protocol',
  });
  return { ...base, ...over };
}

const step = (over: Partial<GuideStep> = {}): GuideStep => ({
  step: 1,
  title: '某一步',
  description: '描述',
  official_url: 'https://demo.xyz',
  minutes: 3,
  cost_usd: 0,
  needs_wallet: false,
  needs_signature: false,
  risk: 'low',
  done_when: '完成',
  source_url: 'https://demo.xyz',
  source_verified: true,
  ...over,
});

describe('新手友好判定', () => {
  it('无本金 + 低 Gas + 低风险 + 无需签名 → 新手友好', () => {
    const p = makeProject({
      cost: {
        capital_min_usd: 0,
        capital_max_usd: 0,
        gas_estimate_usd: 1,
        time_minutes: 8,
        long_term: false,
        summary: '低成本',
      },
      scores: { ...makeProject().scores, risk: 'low' },
      guide: [step({ needs_signature: false })],
    });
    expect(isBeginnerFriendly(p)).toBe(true);
    const v = beginnerVerdict(p);
    expect(v.noCapital).toBe(true);
    expect(v.lowGas).toBe(true);
    expect(v.safeRisk).toBe(true);
    expect(v.noSignature).toBe(true);
    expect(v.reason).toContain('无需本金');
  });

  it('含需要签名 / 授权的步骤 → 不算新手友好', () => {
    const p = makeProject({
      cost: {
        capital_min_usd: 0,
        capital_max_usd: 0,
        gas_estimate_usd: 0,
        time_minutes: 5,
        long_term: false,
        summary: 'x',
      },
      guide: [step({ needs_signature: true })],
    });
    expect(beginnerVerdict(p).noSignature).toBe(false);
    expect(isBeginnerFriendly(p)).toBe(false);
    expect(beginnerVerdict(p).reason).toContain('签名');
  });

  it('耗时不再作为硬性筛选条件（模板耗时不可信，仅作展示）', () => {
    // 即便参考耗时 42 分钟，只要满足客观条件依然应判为新手友好
    const p = makeProject({
      cost: {
        capital_min_usd: 0,
        capital_max_usd: 0,
        gas_estimate_usd: 0,
        time_minutes: 42,
        long_term: false,
        summary: 'x',
      },
      guide: [step({ needs_signature: false })],
    });
    const v = beginnerVerdict(p);
    expect(v.friendly).toBe(true);
    expect(v.totalMinutes).toBe(42);
  });

  it('需要本金 → 不是新手友好，且理由里说明原因', () => {
    const p = makeProject({
      cost: {
        capital_min_usd: 50,
        capital_max_usd: 200,
        gas_estimate_usd: 3,
        time_minutes: 5,
        long_term: false,
        summary: '中等',
      },
    });
    const v = beginnerVerdict(p);
    expect(v.friendly).toBe(false);
    expect(v.reason).toContain('本金');
  });

  it('Gas 超阈值 → 不是新手友好', () => {
    const p = makeProject({
      cost: {
        capital_min_usd: 0,
        capital_max_usd: 0,
        gas_estimate_usd: BEGINNER_RULES.maxGasUsd + 1,
        time_minutes: 5,
        long_term: false,
        summary: 'x',
      },
    });
    expect(beginnerVerdict(p).lowGas).toBe(false);
    expect(isBeginnerFriendly(p)).toBe(false);
  });

  it('高风险 / 极高风险一律不算新手友好（即使免费又快）', () => {
    for (const risk of ['high', 'critical'] as const) {
      const base = makeProject();
      const p = makeProject({
        scores: { ...base.scores, risk },
        cost: {
          capital_min_usd: 0,
          capital_max_usd: 0,
          gas_estimate_usd: 0,
          time_minutes: 3,
          long_term: false,
          summary: 'x',
        },
      });
      expect(isBeginnerFriendly(p)).toBe(false);
    }
  });

  it('time_minutes 为 0 时回退到教程步骤累加（仅用于展示参考耗时）', () => {
    const p = makeProject({
      guide: [step({ minutes: 8, needs_signature: false }), step({ step: 2, minutes: 9, needs_signature: false })],
      cost: {
        capital_min_usd: 0,
        capital_max_usd: 0,
        gas_estimate_usd: 0,
        time_minutes: 0,
        long_term: false,
        summary: 'x',
      },
    });
    const v = beginnerVerdict(p);
    expect(v.totalMinutes).toBe(17);
    expect(v.friendly).toBe(true);
  });

  it('筛选器 beginner=friendly 只保留新手友好项目', () => {
    const friendly = makeProject({
      slug: 'a',
      guide: [step({ needs_signature: false })],
      cost: {
        capital_min_usd: 0,
        capital_max_usd: 0,
        gas_estimate_usd: 0,
        time_minutes: 5,
        long_term: false,
        summary: 'x',
      },
    });
    const notFriendly = makeProject({
      slug: 'b',
      cost: {
        capital_min_usd: 100,
        capital_max_usd: 500,
        gas_estimate_usd: 20,
        time_minutes: 60,
        long_term: true,
        summary: 'x',
      },
    });
    const out = filterProjects([friendly, notFriendly], {
      ...DEFAULT_FILTERS,
      beginner: 'friendly',
    });
    expect(out.map((p) => p.slug)).toEqual(['a']);
    expect(countBeginnerFriendly([friendly, notFriendly])).toBe(1);
  });

  it('beginner=all 时不过滤', () => {
    const a = makeProject({ slug: 'a' });
    expect(filterProjects([a], { ...DEFAULT_FILTERS, beginner: 'all' })).toHaveLength(1);
  });

  it('原有成本分桶逻辑未被破坏', () => {
    const free = makeProject({
      slug: 'free',
      cost: {
        capital_min_usd: 0,
        capital_max_usd: 0,
        gas_estimate_usd: 0,
        time_minutes: 1,
        long_term: false,
        summary: 'x',
      },
    });
    expect(applyCostBucket(free, 'free')).toBe(true);
  });
});

describe('教程来源标注', () => {
  it('没有真实步骤 → 标记为 template', () => {
    const p = makeProject();
    const g = buildGuide(p);
    expect(g.source).toBe('template');
    expect(g.steps.length).toBeGreaterThan(0);
  });

  it('有 ≥3 条真实步骤 → 标记为 sourced，且保留来源链接', () => {
    const p = makeProject({
      sourcedSteps: [
        { title: 'Visit site', body: 'go to site', url: 'https://demo.xyz/a' },
        { title: 'Connect wallet', body: 'connect', url: 'https://demo.xyz/b' },
        { title: 'Complete quest', body: 'do it', url: 'https://demo.xyz/c' },
      ],
    });
    const g = buildGuide(p);
    expect(g.source).toBe('sourced');
    // 首步是我们额外插入的安全检查
    expect(g.steps[0].title).toContain('安全检查');
    expect(g.steps.some((s) => s.source_url === 'https://demo.xyz/a')).toBe(true);
  });

  it('buildGuideAndCost 会把 guide_source 写到项目上', () => {
    const t = buildGuideAndCost(makeProject());
    expect(t.guide_source).toBe('template');

    const s = buildGuideAndCost(
      makeProject({
        sourcedSteps: [
          { title: 'A', body: 'a', url: 'https://demo.xyz/a' },
          { title: 'B', body: 'b', url: 'https://demo.xyz/b' },
          { title: 'C', body: 'c', url: 'https://demo.xyz/c' },
        ],
      }),
    );
    expect(s.guide_source).toBe('sourced');
  });

  it('模板教程不会伪造「来源已核实」（信任不变量）', () => {
    // 历史事故：模板步骤曾用 `source_verified: !!officialUrl`，
    // 导致 142 个项目在前端显示绿色「✓ 来源已核实」。
    const g = buildGuide(makeProject({ official: { website: 'https://demo.xyz' } }));
    expect(g.source).toBe('template');
    for (const s of g.steps) {
      // 模板步骤永远不携带核实标记，也不携带伪造的步骤来源
      expect(s.source_verified).toBe(false);
      expect(s.source_url).toBeUndefined();
    }
  });


  it('全部步骤都没有官方来源时不算「真实教程」（P1-2 误判修正）', () => {
    // 实测事故：聚合站自己写的推广流程（夹着 airdrops.io/goto/bybit/ 这类
    // 返佣跳转）曾被判成官方 HowTo，项目因此拿到 guide_source='sourced'，
    // 绕开了「模板教程最高只能到 B」的等级上限 —— 28 个项目因此
    // 显示「建议参与」，而教程里是跨链组件的广告段。
    const g = buildGuide(
      makeProject({
        official: { website: 'https://demo.xyz' },
        sourcedSteps: [
          { title: 'A', body: 'a' },
          { title: 'B', body: 'b' },
          { title: 'C', body: 'c' },
          { title: 'D', body: 'd' },
        ],
      }),
    );
    expect(g.source, '没有任何可追溯的官方步骤时，只能算流程示意').toBe('template');
  });

  it('真实步骤（sourced）只有带自身来源链接才标为已核实', () => {
    const g = buildGuide(
      makeProject({
        official: { website: 'https://demo.xyz' },
        sourcedSteps: [
          { title: 'A', body: 'a', url: 'https://demo.xyz/a' },
          { title: 'B', body: 'b', url: 'https://demo.xyz/b' },
          { title: 'C', body: 'c' }, // 无 url
        ],
      }),
    );
    // ⚠️ P1-2 收紧后：判定「真实教程」看的是**可追溯步骤条数 >= 3**，
    //    这里 3 条里只有 A / B 两条带官方链接，因此只能算「流程示意」。
    //    这不是退步 —— 而是把「三条里两条没有来源」如实反映成
    //    「这份教程的可追溯性不足」，模板教程的等级上限（最高 B）随之生效。
    expect(g.source).toBe('template');
    // C 本身无来源链接，即便在 sourced 形态下也不得自称已核实：
    // 这里改用 4 条（3 条带官方链接）来验证「逐条如实标注」这条不变量。
    const g2 = buildGuide(
      makeProject({
        official: { website: 'https://demo.xyz' },
        sourcedSteps: [
          { title: 'A', body: 'a', url: 'https://demo.xyz/a' },
          { title: 'B', body: 'b', url: 'https://demo.xyz/b' },
          { title: 'C', body: 'c' },
          { title: 'D', body: 'd', url: 'https://demo.xyz/d' },
        ],
      }),
    );
    expect(g2.source).toBe('sourced');
    expect(g2.steps[0].source_verified).toBe(false);
    expect(g2.steps.find((s) => s.title === 'C')?.source_verified).toBe(false);
    expect(g2.steps.find((s) => s.title === 'A')?.source_url).toBe('https://demo.xyz/a');
    expect(g2.steps.find((s) => s.title === 'A')?.source_verified).toBe(true);
  });
});

describe('首访引导', () => {
  it('安全四句存在且覆盖关键风险点', () => {
    expect(SAFETY_LINES.length).toBe(4);
    const text = SAFETY_LINES.join(' ');
    expect(text).toContain('助记词');
    expect(text).toContain('私钥');
    expect(text).toContain('主钱包');
  });

  it('未看过 → 需要展示；已看过当前版本 → 不再展示', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;

    expect(shouldShowOnboarding(fake)).toBe(true);
    fake.setItem('dropscope.onboarding.v1', String(ONBOARDING_VERSION));
    expect(shouldShowOnboarding(fake)).toBe(false);
  });

  it('引导版本变化后老用户会重新看到一次', () => {
    const store = new Map<string, string>([['dropscope.onboarding.v1', '0']]);
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;
    expect(shouldShowOnboarding(fake)).toBe(true);
  });

  it('LocalStorage 不可用时不崩溃', () => {
    expect(() => shouldShowOnboarding(undefined)).not.toThrow();
    expect(shouldShowOnboarding(undefined)).toBe(false);
  });
});
