/**
 * 变化判定与阶段顺序的回归测试。
 *
 * 对应两个真实踩过的坑（每 10 分钟跑一次定时流水线时必然暴露）：
 *   1) 变化判定口径 —— 不剔除 last_checked_at / fetched_at / undefined，
 *      会把所有项目误判为「已变化」，导致「数据变化时间」永远显示「刚刚」，
 *      并产生每 10 分钟一次的无效提交与推送。
 *   2) 阶段顺序 —— 先 Score 后建成本，会让参与价值评分滞后一轮，
 *      同一份数据连跑两次评分不同。
 */

import { describe, it, expect } from 'vitest';
import {
  diffProjects,
  canonicalize,
  projectDigest,
  stableStringify,
} from '../scripts/lib/change';
import { toSkeleton } from '../scripts/lib/merge';
import { scoreAll } from '../scripts/lib/score';
import { buildFaqAndRisks, buildGuideAndCost } from '../scripts/lib/guide';
import type { AirdropProject } from '../src/lib/types';

const T1 = '2026-09-12T10:00:00.000Z';
const T2 = '2026-09-12T10:10:00.000Z';

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

describe('canonicalize 规范化', () => {
  it('剔除值为 undefined 的键（与 JSON 落盘后的形态对齐）', () => {
    const withUndefined = canonicalize({ a: 1, b: undefined });
    const withoutKey = canonicalize({ a: 1 });
    expect(withUndefined).toEqual(withoutKey);
    expect(JSON.stringify(withUndefined)).toBe(JSON.stringify(withoutKey));
  });

  it('嵌套对象 / 数组里的 undefined 同样被剔除', () => {
    const a = canonicalize({ items: [{ x: 1, y: undefined }] });
    const b = canonicalize({ items: [{ x: 1 }] });
    expect(a).toEqual(b);
  });

  it('键顺序不影响结果', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('时间戳字段被归一为占位符，不参与比较', () => {
    const a = canonicalize({ last_checked_at: T1, v: 1 });
    const b = canonicalize({ last_checked_at: T2, v: 1 });
    expect(a).toEqual(b);
  });
});

describe('项目指纹 projectDigest', () => {
  it('只有抓取时间变化 → 指纹不变（关键：避免误判为已变化）', () => {
    const a = makeProject({ last_checked_at: T1 });
    const b: AirdropProject = {
      ...a,
      last_checked_at: T2,
      sources: a.sources.map((s) => ({ ...s, fetched_at: T2 })),
    };
    expect(projectDigest(a)).toBe(projectDigest(b));
  });

  it('状态变化 → 指纹变化', () => {
    const a = makeProject();
    const b = makeProject({ status: 'claim_live' });
    expect(projectDigest(a)).not.toBe(projectDigest(b));
  });

  it('评分变化 → 指纹变化', () => {
    const a = makeProject();
    const b: AirdropProject = { ...a, scores: { ...a.scores, value: 80 } };
    expect(projectDigest(a)).not.toBe(projectDigest(b));
  });

  it('cost / guide 变化 → 指纹变化', () => {
    const a = makeProject();
    const b: AirdropProject = { ...a, cost: { ...a.cost, time_minutes: 99 } };
    expect(projectDigest(a)).not.toBe(projectDigest(b));
  });

  it('指纹元字段自身不参与计算（否则会形成自引用）', () => {
    const a = makeProject();
    const b: AirdropProject = { ...a, digest: 'whatever', last_changed_at: T2 };
    expect(projectDigest(a)).toBe(projectDigest(b));
  });

  it('写入 digest 后再读回，指纹保持一致', () => {
    const a = makeProject();
    const roundTripped = JSON.parse(JSON.stringify({ ...a, digest: projectDigest(a) }));
    expect(projectDigest(roundTripped)).toBe(projectDigest(a));
  });

  it('undefined 证据链接落盘后不改变指纹', () => {
    const a = makeProject({
      scores: {
        ...makeProject().scores,
        authenticityItems: [
          { key: 'k', label: 'l', value: 1, max: 2, reason: 'r', evidenceUrl: undefined },
        ],
      },
    });
    const roundTripped = JSON.parse(JSON.stringify(a));
    expect(projectDigest(roundTripped)).toBe(projectDigest(a));
  });
});

describe('集合差异 diffProjects', () => {
  it('完全相同的集合判定为无变化', () => {
    const list = [makeProject({ slug: 'a' }), makeProject({ slug: 'b' })];
    expect(diffProjects(list, list).changed).toBe(false);
  });

  it('仅时间戳不同不算变化', () => {
    const before = [makeProject({ last_checked_at: T1 })];
    const after = [
      {
        ...before[0],
        last_checked_at: T2,
        sources: before[0].sources.map((s) => ({ ...s, fetched_at: T2 })),
      },
    ];
    expect(diffProjects(before, after).changed).toBe(false);
  });

  it('新增 / 移除 / 变更能被分别识别', () => {
    const base = makeProject({ slug: 'base' });
    const modified = makeProject({ slug: 'mod', status: 'potential' });
    const modifiedAfter = makeProject({ slug: 'mod', status: 'claim_live' });

    const d = diffProjects([base, modified], [base, modifiedAfter, makeProject({ slug: 'new' })]);
    expect(d.changed).toBe(true);
    expect(d.added).toEqual(['new']);
    expect(d.modified).toEqual(['mod']);
    expect(d.removed).toEqual([]);
  });

  it('项目顺序变化不算变化', () => {
    const a = makeProject({ slug: 'a' });
    const b = makeProject({ slug: 'b' });
    expect(diffProjects([a, b], [b, a]).changed).toBe(false);
  });
});

describe('阶段顺序：Guide/Cost → Score → FAQ/Risks', () => {
  /** 按流水线的真实顺序处理单个项目：Guide/Cost → Score → FAQ/Risks */
  function run(p: AirdropProject): AirdropProject {
    const withGuide = buildGuideAndCost(p);
    return buildFaqAndRisks(scoreAll([withGuide])[0]);
  }

  it('参与价值评分一次即收敛（不再滞后一轮）', () => {
    const p1 = run(makeProject());
    const p2 = run(p1);
    const p3 = run(p2);
    expect(p2.scores.value).toBe(p1.scores.value);
    expect(p3.scores.value).toBe(p2.scores.value);
    expect(projectDigest(p2)).toBe(projectDigest(p3));
  });

  it('成本模型在评分前已就绪，投入产出比依据真实步骤时长', () => {
    const p1 = run(makeProject());
    // 教程存在 → 成本时长由步骤推导 → ROI 项能给出基于真实时长的理由
    expect(p1.guide.length).toBeGreaterThan(0);
    expect(p1.cost.time_minutes).toBe(
      p1.guide.reduce((s, g) => s + g.minutes, 0),
    );
    const roi = p1.scores.valueItems.find((i) => i.key === 'value.roi');
    expect(roi?.reason).toContain(String(p1.cost.time_minutes));
  });

  it('FAQ 与风险文案读取的是本轮评分，而不是上一轮', () => {
    const p = run(makeProject());
    // 风险提示里引用真实性分数，必须与本轮 scores.authenticity 一致
    const lowAuth = p.scores.authenticity < 60;
    expect(p.risks.some((r) => r.includes('真实性置信度偏低'))).toBe(lowAuth);
  });
});
