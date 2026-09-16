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
import { officialStepLink } from '../scripts/fetch/airdrops-io';
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
   * ⚠️ 必须 import **生产函数**，不能在测试里复刻实现。
   *
   * 独立审查实测：本文件原先把 `officialStepLink` 抄了一遍放在测试里，
   * 于是把**真实实现**放宽成「取第一个链接」后，
   * `npx vitest run` 全绿、`npm run validate` 全绿 ——
   * 护栏只在测自己抄的那份代码，拦不住任何回归。
   * 实测放宽后 `guide_source` 会从 template:258 变成 template:253 / sourced:5，
   * 5 个项目凭空拿到「真实教程」、15 条步骤被标 `source_verified: true`
   * （doppler-finance / ethena / infinex / jupiter / tread-fi），
   * 正是 P1-2 的原故障形态。
   *
   * 因此这里从 `scripts/fetch/airdrops-io` 直接 import。
   * 该模块顶层没有网络副作用（只声明常量与函数），可以安全引入。
   */
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
   * 回归护栏（对抗「放宽成取第一个链接」的变异）：聚合站跳转必须被跳过，
   * 即便它出现在官方链接**之前**。旧实现会返回第一个链接 → 本断言变红。
   */
  it('广告链接在前、官方链接在后时，必须返回官方链接（变异护栏）', () => {
    const html =
      '<a href="https://airdrops.io/goto/bybit/">赞助商</a><a href="https://demo.xyz/go">开始</a>';
    expect(officialStepLink(html, 'demo.xyz')).toBe('https://demo.xyz/go');
    expect(
      officialStepLink(html, 'demo.xyz'),
      '放宽成「取第一个链接」时这里会返回 airdrops.io 的返佣跳转',
    ).not.toContain('airdrops.io');
  });

  it('只要官方链接，不要第三方域名的链接', () => {
    const html =
      '<a href="https://t.me/demo">社群</a><a href="https://demo.xyz/claim">领取</a><a href="https://x.com/demo">关注</a>';
    expect(officialStepLink(html, 'demo.xyz')).toBe('https://demo.xyz/claim');
  });

  /**
   * ⚠️ 已知取舍：子域名（app.example.com）**不**算官方来源。
   *    理由：官方步骤链接通常指向主域或 www；放宽到子域名的收益为零
   *    （实测来源侧步骤链接数 = 0/344），而风险非零
   *    —— `app.x.com` 与 `x.com` 可能指向不同实体。
   *    （此处原先写的理由是「避免放进 app.airdrops.io」，但
   *     `officialHost` 取自 `data-outbound-host`，本就不会是聚合站域名，
   *     该理由不成立，已按审查意见更正。）
   */
  it('子域名不算官方来源（保守取舍：收益为零、风险非零）', () => {
    expect(
      officialStepLink('<a href="https://app.sweep.finance/a">x</a>', 'sweep.finance'),
    ).toBeUndefined();
  });
});
