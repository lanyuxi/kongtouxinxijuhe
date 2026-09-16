/**
 * P1-2｜价值分必须把「教程可信度」当硬门槛（对应上轮审查 BUG-4）。
 *
 * 实测问题：
 *   12 个 S/A 项目里 11 个（92%）的教程是**模板生成的通用流程**，
 *   点进去是「参与前准备 → 进入官方活动页面 → 完成核心链上任务」
 *   这种任何项目都适用的流程；另有 31 个项目 `tasks` 为空。
 *
 *   对用户的实际影响：
 *     平台说「S 级 · 可重点参与」，但用户点进去拿不到任何**这个项目特有**的操作信息。
 *     更糟的是「教程是否可信」是「值不值得投时间」的第一变量 ——
 *     一个连官方步骤都拿不到的项目，凭什么告诉用户「值得重点投入」？
 *
 * 修复原则：
 *   1. 价值分引入「教程可信度」作为**扣分项**（不是简单封顶）：
 *      - `guide_source = 'template'` → 教程可信度扣分（占权重的固定份额）
 *      - 教程步骤过少（< 3 步）→ 额外扣分
 *   2. 等级仍由总分推导，但**模板教程的项目不得进入 S**（A 可以，
 *      因为 A 的语义是「值得参与」而不是「重点参与」）
 *   3. 分数必须可解释：新增 `value.guide_trust` 评分项，写明扣了多少、为什么
 */
import { describe, it, expect } from 'vitest';
import { scoreValue, gradeOf } from '../scripts/lib/score';
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

function steps(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    step: i + 1,
    title: `步骤 ${i + 1}`,
    description: '说明',
    official_url: 'https://demo.xyz',
    minutes: 5,
    cost_usd: 0,
    needs_wallet: true,
    needs_signature: false,
    risk: 'low' as const,
    done_when: '完成',
    source_verified: true,
  }));
}

describe('P1-2 教程可信度作为价值分门槛', () => {
  it('模板教程的扣分必须可解释', () => {
    const p = make({ guide_source: 'template', guide: steps(5), tasks: ['存入资产'] });
    const r = scoreValue(p);
    const item = r.items.find((i) => i.key === 'value.guide_trust');
    expect(item).toBeDefined();
    expect(item!.value).toBeLessThan(item!.max);
    expect(item!.reason).toContain('示意');
  });

  it('真实教程（sourced）不扣教程可信度分', () => {
    const p = make({ guide_source: 'sourced', guide: steps(5), tasks: ['存入资产'] });
    const r = scoreValue(p);
    const item = r.items.find((i) => i.key === 'value.guide_trust');
    expect(item!.value).toBe(item!.max);
  });

  it('模板教程的项目不得进入 S 级（A 允许）', () => {
    const p = make({
      status: 'claim_live',
      guide_source: 'template',
      guide: steps(5),
      tasks: ['领取空投'],
      official: { website: 'https://demo.xyz', docs: 'https://docs.demo.xyz', github: 'https://github.com/demo' },
      meta: { funding: 'Series A', investors: ['A'], token_status: '已发币' },
      cost: { capital_min_usd: 0, capital_max_usd: 0, gas_estimate_usd: 0, time_minutes: 30, long_term: false, summary: '' },
    });
    p.evidence = [
      { type: 'official_website', label: 'w', url: 'https://demo.xyz', verified: true },
      { type: 'official_docs', label: 'd', url: 'https://docs.demo.xyz', verified: true },
      { type: 'third_party', label: 't', url: 'https://a.io/x', verified: true },
      { type: 'third_party', label: 't2', url: 'https://b.io/x', verified: true },
    ];
    const r = scoreValue(p);
    expect(r.grade, '模板教程的项目不该被判「重点参与」').not.toBe('S');
  });

  it('教程步骤过少时额外扣分', () => {
    const many = make({ guide_source: 'sourced', guide: steps(6), tasks: ['存入资产'] });
    const few = make({ guide_source: 'sourced', guide: steps(1), tasks: ['存入资产'] });
    const a = scoreValue(many).items.find((i) => i.key === 'value.guide_trust')!.value;
    const b = scoreValue(few).items.find((i) => i.key === 'value.guide_trust')!.value;
    expect(b).toBeLessThan(a);
  });

  it('gradeOf 阈值不变（避免静默改变历史结论）', () => {
    expect(gradeOf(85)).toBe('S');
    expect(gradeOf(70)).toBe('A');
    expect(gradeOf(55)).toBe('B');
    expect(gradeOf(40)).toBe('C');
    expect(gradeOf(39)).toBe('D');
  });
});

describe('P1-2 全量数据不变量', () => {
  it('不存在「模板教程却判 S 级」的项目', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const bad = dataset.projects.filter(
      (p) => p.scores.grade === 'S' && p.guide_source === 'template',
    );
    expect(
      bad.map((p) => p.slug),
      `以下项目教程是模板却判 S 级：${bad.map((p) => p.slug).join('、')}`,
    ).toEqual([]);
  });
});
