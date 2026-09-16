/**
 * P1-3｜真实性置信度不能退化成一个常数（对应上轮审查 BUG-2）。
 *
 * 实测问题（修复前）：
 *   202 个项目里 182 个的真实性分是同一个数字 22（90%），
 *   因为公式对「同一种数据缺失」永远输出同一结果：官网 15 + 第三方 7 = 22。
 *   用户在详情页看到「真实性置信度 22/100 · 证据不足」，
 *   会以为这是逐项评估的结论，实际上是**同一条公式的固定输出**，
 *   拿它做不了任何横向比较。
 *
 * 这不是算错，是「用『有没有数据』冒充了『项目可不可信』」。
 *
 * 修复原则：
 *   1. 缺数据的维度**不参与分母** —— 真实性 = 可得证据得分 / 该样本可得的满分之和
 *   2. 同时输出「证据覆盖率 N/M」，让用户知道这个百分比是在多少维度上算出来的
 *   3. 覆盖率过低时明确降级，不给一个看起来很确定的百分比
 */
import { describe, it, expect } from 'vitest';
import { scoreAuthenticity, AUTH_MIN_COVERAGE } from '../scripts/lib/score';
import type { AirdropProject, Evidence } from '../src/lib/types';
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

const ev = (over: Partial<Evidence> & { type: Evidence['type'] }): Evidence => ({
  label: over.type,
  url: `https://${over.type}.example.com`,
  verified: true,
  ...over,
});

describe('P1-3 真实性分归一化', () => {
  it('「官网 + 1 个第三方」不再是那个固定常数 22', () => {
    const p = make({
      official: { website: 'https://a.com' },
      evidence: [ev({ type: 'official_website' }), ev({ type: 'third_party' })],
    });
    const r = scoreAuthenticity(p, p.evidence);
    expect(r.total).not.toBe(22);
  });

  it('证据同形但官方渠道更全时，分数更高（区分度来自连续取值而非二值项）', () => {
    const thin = make({
      official: { website: 'https://a.com' },
      evidence: [ev({ type: 'official_website' }), ev({ type: 'third_party' })],
    });
    const thick = make({
      official: {
        website: 'https://a.com',
        x: 'https://x.com/a',
        docs: 'https://docs.a.com',
        github: 'https://github.com/a',
      },
      evidence: [
        ev({ type: 'official_website' }),
        ev({ type: 'official_docs' }),
        ev({ type: 'official_github' }),
        ev({ type: 'third_party' }),
      ],
    });
    expect(scoreAuthenticity(thick, thick.evidence).total).toBeGreaterThan(
      scoreAuthenticity(thin, thin.evidence).total,
    );
  });

  it('必须提供证据核查清单，且逐项可读（这是本项修复的表现层核心）', () => {
    const p = make({
      official: { website: 'https://a.com' },
      evidence: [ev({ type: 'official_website' }), ev({ type: 'third_party' })],
    });
    const r = scoreAuthenticity(p, p.evidence);
    expect(r.checklist).toBeDefined();
    expect(r.checklist!.length).toBe(9);
    for (const c of r.checklist!) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.note.length).toBeGreaterThan(0);
      expect(['verified', 'partial', 'missing', 'not_applicable']).toContain(c.status);
    }
    expect(r.verifiedCount).toBeGreaterThanOrEqual(0);
  });

  it('「未适用」与「查了没查到」必须区分开', () => {
    // 潜在状态的项目：官方本来就没有公告 → 不是「缺失」，而是「不适用」
    const potential = make({
      status: 'potential',
      official: { website: 'https://a.com' },
      evidence: [ev({ type: 'official_website' })],
    });
    const ann = scoreAuthenticity(potential, potential.evidence).checklist!.find(
      (c) => c.label === '官方公告',
    );
    expect(ann?.status).toBe('not_applicable');

    // 已确认状态的项目：有公告才是应然 → 没有就是真的缺失
    const confirmed = make({
      status: 'confirmed',
      official: { website: 'https://a.com' },
      evidence: [ev({ type: 'official_website' })],
    });
    const ann2 = scoreAuthenticity(confirmed, confirmed.evidence).checklist!.find(
      (c) => c.label === '官方公告',
    );
    expect(ann2?.status).toBe('missing');
  });

  it('证据更全的项目分数更高（单调性）', () => {
    const thin = make({
      official: { website: 'https://a.com' },
      evidence: [ev({ type: 'official_website' }), ev({ type: 'third_party' })],
    });
    const rich = make({
      status: 'confirmed',
      official: {
        website: 'https://a.com',
        x: 'https://x.com/a',
        docs: 'https://docs.a.com',
        github: 'https://github.com/a',
        discord: 'https://discord.gg/a',
      },
      meta: { funding: 'Series A' },
      evidence: [
        ev({ type: 'official_website' }),
        ev({ type: 'official_docs' }),
        ev({ type: 'official_github' }),
        ev({ type: 'official_announcement' }),
        ev({ type: 'third_party' }),
        ev({ type: 'third_party', url: 'https://other.example.com' }),
        ev({ type: 'funding' }),
      ],
    });
    expect(scoreAuthenticity(rich, rich.evidence).total).toBeGreaterThan(
      scoreAuthenticity(thin, thin.evidence).total,
    );
  });

  it('必须给出证据覆盖率 N/M', () => {
    const p = make({
      official: { website: 'https://a.com' },
      evidence: [ev({ type: 'official_website' })],
    });
    const r = scoreAuthenticity(p, p.evidence);
    expect(r.available).toBeGreaterThan(0);
    expect(r.available).toBeLessThanOrEqual(r.totalDimensions);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThanOrEqual(1);
  });

  it('覆盖率过低时给出明确的低置信标记', () => {
    const p = make({ evidence: [] });
    const r = scoreAuthenticity(p, p.evidence);
    expect(r.coverage).toBeLessThan(AUTH_MIN_COVERAGE);
    expect(r.lowCoverage).toBe(true);
  });

  it('得分永不超出 0–100', () => {
    const p = make({
      status: 'confirmed',
      official: { website: 'https://a.com', docs: 'https://docs.a.com', github: 'https://github.com/a' },
      evidence: [
        ev({ type: 'official_website' }),
        ev({ type: 'official_docs' }),
        ev({ type: 'official_github' }),
        ev({ type: 'official_announcement' }),
        ev({ type: 'funding' }),
        ev({ type: 'contract' }),
        ev({ type: 'quest_space' }),
      ],
    });
    const r = scoreAuthenticity(p, p.evidence);
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it('评分项仍逐条可解释（不变量 2）', () => {
    const p = make({ official: { website: 'https://a.com' }, evidence: [ev({ type: 'official_website' })] });
    const r = scoreAuthenticity(p, p.evidence);
    expect(r.items.length).toBeGreaterThan(3);
    for (const i of r.items) {
      expect(i.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('P1-3 全量数据校验：真实性分不得退化成常数', () => {
  it('同一个分数不应覆盖 > 60% 的项目（修复前 90%）', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const dist = new Map<number, number>();
    for (const p of dataset.projects) {
      dist.set(p.scores.authenticity, (dist.get(p.scores.authenticity) ?? 0) + 1);
    }
    const [topScore, topCount] = [...dist.entries()].sort((a, b) => b[1] - a[1])[0];
    const ratio = topCount / dataset.projects.length;
    expect(
      ratio,
      `真实性分 ${topScore} 覆盖了 ${(ratio * 100).toFixed(0)}% 的项目，说明评分又退化成常数了`,
    ).toBeLessThan(0.6);
  });
});


describe('P1-2 教程来源判定：只认项目自己的官方域名', () => {
  /**
   * 为什么必须逐条锁定边界（实测事故）：
   *   聚合站自己写的推广流程里夹着 `airdrops.io/goto/bybit/` 返佣跳转，
   *   旧实现「取步骤正文里的第一个链接」，于是这些广告步骤被算成
   *   「可追溯到来源」，项目拿到 guide_source='sourced'，
   *   连「模板教程最高只能到 B」的等级上限都被绕开 ——
   *   最终 28 个项目显示「建议参与」，教程里却是跨链组件的广告段。
   *
   * 边界必须覆盖：www 前缀、大小写、相对链接、聚合站跳转、子域名。
   */
  const officialStepLink = (html: string, officialHost?: string): string | undefined => {
    if (!html || !officialHost) return undefined;
    const host = officialHost.replace(/^www\./, '').toLowerCase();
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const href of links) {
      try {
        const u = new URL(href);
        const h = u.hostname.replace(/^www\./, '').toLowerCase();
        if (h === host) return href;
      } catch {
        /* 相对链接不算官方来源 */
      }
    }
    return undefined;
  };

  it('官方域名的链接被接受（含 www 前缀与大小写差异）', () => {
    expect(officialStepLink('<a href="https://sweep.finance/a">x</a>', 'sweep.finance')).toBe(
      'https://sweep.finance/a',
    );
    expect(officialStepLink('<a href="https://www.sweep.finance/a">x</a>', 'sweep.finance')).toBe(
      'https://www.sweep.finance/a',
    );
    expect(officialStepLink('<a href="https://SWEEP.FINANCE/a">x</a>', 'sweep.finance')).toBe(
      'https://SWEEP.FINANCE/a',
    );
  });

  it('聚合站跳转与相对链接一律不算官方来源', () => {
    expect(officialStepLink('<a href="/visit/r0b3/">x</a>', 'sweep.finance')).toBeUndefined();
    expect(
      officialStepLink('<a href="https://airdrops.io/goto/bybit/">x</a>', 'sweep.finance'),
    ).toBeUndefined();
  });

  it('缺失官方域名时不做任何猜测', () => {
    expect(officialStepLink('<a href="https://sweep.finance/a">x</a>', undefined)).toBeUndefined();
    expect(officialStepLink('', 'sweep.finance')).toBeUndefined();
  });

  /**
   * ⚠️ 已知取舍：子域名（app.example.com）**不**算官方来源。
   *    这是刻意的保守选择 —— 官方步骤链接通常指向主域或 www，
   *    而放宽到子域名会把 `app.airdrops.io` 这类聚合站子域也放进来。
   *    实测当前来源侧的步骤链接数为 0（airdrops.io 并不给官方 HowTo 链接），
   *    因此收紧不会丢数据，只会把「伪 sourced」如实降级。
   */
  it('子域名不算官方来源（保守取舍，避免把聚合站子域放进来）', () => {
    expect(officialStepLink('<a href="https://app.sweep.finance/a">x</a>', 'sweep.finance')).toBeUndefined();
  });
});
