/**
 * P0-2｜风险分级必须看「金额与签名」，不能只猜关键词（对应上轮审查 BUG-5）。
 *
 * 实测问题：
 *   风险判定的输入只有 [tagline, ...tasks, ...requirements] 的文本关键词。
 *   Aave V3 的 haystack 是「Lending 协议，TVL 约 $16754M。 存入资产 借出资产 保持健康度」
 *   —— 里面没有任何风险关键词命中，于是判 low。
 *   但同一张卡片上同时显示着「预计资金 $20–200」。
 *   实测：101 个 low 风险项目里，94%（95 个）带签名步骤，30 个要求投入本金。
 *
 *   「低风险」三个字在新手眼里等于「可以放心做」，而真相是
 *   「要投入 200 美元本金并签署交易」。分级定义本身是「亏损概率 × 亏损金额」，
 *   只看关键词等于把「金额」这一半输入直接丢了。
 *
 * 修复原则（先用最可信的结构化字段，再退回到文本推断）：
 *   1. `guide[].needs_signature` → 至少 medium（签名不可撤销）
 *   2. `cost.capital_max_usd > 0` → 至少 medium
 *   3. `cost.capital_max_usd >= 200` → 至少 high（真金白银的量级）
 *   4. 结构字段缺失时，仍保留原有文本关键词推断（不降低既有能力）
 *   5. 一票否决（私钥 / 助记词）优先级最高，永远 critical
 */
import { describe, it, expect } from 'vitest';
import { scoreRisk, riskFloors, RISK_RANK } from '../scripts/lib/score';
import type { AirdropProject, GuideStep } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';

const now = '2026-09-16T00:00:00.000Z';

function make(over: Partial<AirdropProject> = {}): AirdropProject {
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
    fetchedAt: now,
    rawTitle: 'Demo Protocol',
  });
  return { ...base, ...over };
}

function step(over: Partial<GuideStep> = {}): GuideStep {
  return {
    step: 1,
    title: '连接钱包',
    description: '按页面提示操作',
    official_url: 'https://demo.xyz',
    minutes: 2,
    cost_usd: 0,
    needs_wallet: true,
    needs_signature: false,
    risk: 'low',
    done_when: '完成',
    source_verified: true,
    ...over,
  };
}

describe('P0-2 风险下限：结构化字段', () => {
  it('含签名步骤 → 至少 medium（Aave V3 场景）', () => {
    const p = make({
      guide: [step({ needs_signature: true })],
      cost: { capital_min_usd: 0, capital_max_usd: 0, gas_estimate_usd: 0, time_minutes: 10, long_term: false, summary: '' },
    });
    expect(RISK_RANK[scoreRisk(p).level]).toBeGreaterThanOrEqual(RISK_RANK.medium);
  });

  it('需要本金 → 至少 medium', () => {
    const p = make({
      cost: { capital_min_usd: 20, capital_max_usd: 50, gas_estimate_usd: 5, time_minutes: 10, long_term: false, summary: '' },
    });
    expect(RISK_RANK[scoreRisk(p).level]).toBeGreaterThanOrEqual(RISK_RANK.medium);
  });

  it('本金 ≥ $200 → 至少 high', () => {
    const p = make({
      cost: { capital_min_usd: 20, capital_max_usd: 200, gas_estimate_usd: 5, time_minutes: 10, long_term: false, summary: '' },
    });
    expect(RISK_RANK[scoreRisk(p).level]).toBeGreaterThanOrEqual(RISK_RANK.high);
  });

  it('既无本金也无签名、只连接钱包 → 仍是 low', () => {
    const p = make({
      guide: [step()],
      cost: { capital_min_usd: 0, capital_max_usd: 0, gas_estimate_usd: 0, time_minutes: 5, long_term: false, summary: '' },
    });
    expect(scoreRisk(p).level).toBe('low');
  });

  it('一票否决（索取私钥）优先级最高，任何结构化字段都不能降级', () => {
    const p = make({
      tagline: '需要输入助记词才能领取',
      cost: { capital_min_usd: 0, capital_max_usd: 0, gas_estimate_usd: 0, time_minutes: 5, long_term: false, summary: '' },
    });
    expect(scoreRisk(p).level).toBe('critical');
  });

  it('风险下限必须可解释（给出是哪个字段把等级抬上去的）', () => {
    const p = make({
      cost: { capital_min_usd: 20, capital_max_usd: 200, gas_estimate_usd: 0, time_minutes: 5, long_term: false, summary: '' },
    });
    const r = scoreRisk(p);
    const keys = r.items.map((i) => i.key);
    expect(keys).toContain('risk.capital');
    expect(r.items.find((i) => i.key === 'risk.capital')?.reason).toContain('200');
  });

  it('riskFloors 是纯函数：输入结构字段，输出该结构字段对应的最低风险', () => {
    expect(riskFloors({ capitalMaxUsd: 0, needsSignature: false, needsCapital: false })).toBe('low');
    expect(riskFloors({ capitalMaxUsd: 0, needsSignature: true, needsCapital: false })).toBe('medium');
    expect(riskFloors({ capitalMaxUsd: 200, needsSignature: false, needsCapital: true })).toBe('high');
  });
});

describe('P0-2 全量数据校验：low 风险不得与「要本金 / 要签名」同时出现', () => {
  it('airdrop 数据里不存在 risk=low 但需要本金或签名的项目', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const bad = dataset.projects.filter(
      (p) =>
        p.scores.risk === 'low' &&
        ((p.cost?.capital_max_usd ?? 0) > 0 || p.guide.some((g) => g.needs_signature)),
    );
    expect(
      bad.map((p) => p.slug),
      `以下项目标为低风险却要求本金/签名：${bad.map((p) => p.slug).join('、')}`,
    ).toEqual([]);
  });
});

describe('P0-2 自查修正：预估金额不得被表述为确定金额', () => {
  it('capital 风险的 reason 必须标明「预估」而非要求确定的金额', () => {
    const p = make({
      cost: { capital_min_usd: 20, capital_max_usd: 200, gas_estimate_usd: 0, time_minutes: 5, long_term: false, summary: '' },
    });
    const item = scoreRisk(p).items.find((i) => i.key === 'risk.capital')!;
    // 实测依据：capital_max_usd 由 costFromSource() 按关键词推断，
    // 96 个项目的 min/max 全是 20/200 —— 是估值不是实测。
    expect(item.reason).toContain('预估');
    expect(item.reason).toContain('20–200');
    expect(item.reason).not.toMatch(/需要投入约 \$200 本金，/);
  });
});
