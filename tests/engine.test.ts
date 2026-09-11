import { describe, it, expect } from 'vitest';
import { normalize, normalizeStatus, slugify } from '../scripts/lib/normalize';
import { mergeAll } from '../scripts/lib/merge';
import { buildEvidence, isProjectVerified, verifyAll } from '../scripts/lib/verify';
import { scoreAuthenticity, scoreRisk, scoreValue, gradeOf, buildRecommendation } from '../scripts/lib/score';
import { validateProjects } from '../scripts/lib/validate';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';

const now = '2026-09-11T10:00:00.000Z';

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

describe('normalize', () => {
  it('生成稳定 slug', () => {
    expect(slugify('Demo Protocol')).toBe('demo-protocol');
    expect(slugify('  Hello   World!  ')).toBe('hello-world');
  });

  it('状态归一为保守值', () => {
    expect(normalizeStatus('Claim Live')).toBe('claim_live');
    expect(normalizeStatus('Confirmed')).toBe('confirmed');
    expect(normalizeStatus('Ended')).toBe('ended');
    expect(normalizeStatus(undefined)).toBe('potential');
    expect(normalizeStatus('随便什么')).toBe('potential');
  });

  it('保留来源信息', () => {
    const n = normalize({
      sourceType: 'quest_platform',
      sourceName: 'Galxe',
      sourceUrl: 'https://app.galxe.com/quest/explore/all',
      title: 'Monad',
      url: 'https://app.galxe.com/quest/Monad',
      fetchedAt: now,
    });
    expect(n.sourceType).toBe('quest_platform');
    expect(n.slug).toBe('monad');
  });
});

describe('merge 去重', () => {
  it('同一项目来自两个来源时合并为一个', () => {
    const a = normalize({
      sourceType: 'airdrop_aggregator',
      sourceName: 'Airdrops.io',
      sourceUrl: 'https://airdrops.io/latest/',
      title: 'Monad',
      url: 'https://airdrops.io/monad/',
      fetchedAt: now,
    });
    const b = normalize({
      sourceType: 'quest_platform',
      sourceName: 'Galxe',
      sourceUrl: 'https://app.galxe.com/quest/explore/all',
      title: 'Monad',
      url: 'https://app.galxe.com/quest/Monad',
      fetchedAt: now,
    });
    const merged = mergeAll([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toHaveLength(2);
  });

  it('重复运行不会累积 sources / evidence（幂等）', () => {
    const item = normalize({
      sourceType: 'airdrop_aggregator',
      sourceName: 'Airdrops.io',
      sourceUrl: 'https://airdrops.io/latest/',
      title: 'Monad',
      url: 'https://airdrops.io/monad/',
      fetchedAt: now,
    });
    const first = mergeAll([item]);
    const second = mergeAll([item], first);
    const third = mergeAll([item], second);
    expect(third[0].sources).toHaveLength(1);
  });

  it('来源失败时保留上一版数据（Last Known Good）', () => {
    const prev = mergeAll([
      normalize({
        sourceType: 'airdrop_aggregator',
        sourceName: 'Airdrops.io',
        sourceUrl: 'https://airdrops.io/latest/',
        title: 'Monad',
        url: 'https://airdrops.io/monad/',
        fetchedAt: now,
      }),
    ]);
    // 本次抓取返回空数组（模拟来源全部失败）
    const after = mergeAll([], prev);
    expect(after).toHaveLength(1);
  });
});

describe('verify 证据', () => {
  it('未验证的 X 账号不得计入已验证证据', () => {
    const p = verifyAll([
      makeProject({
        official: { website: 'https://demo.xyz', x: 'https://x.com/demo' },
      }),
    ])[0];
    const xEv = p.evidence.find((e) => e.type === 'official_x');
    expect(xEv?.verified).toBe(false);
  });

  it('聚合站链接不得被视为官方链接', () => {
    const p = verifyAll([
      makeProject({ official: { website: 'https://airdrops.io/demo/' } }),
    ])[0];
    const site = p.evidence.find((e) => e.type === 'official_website');
    expect(site).toBeUndefined();
  });

  it('仅靠聚合站收录 + 一个官网，不足以认定为已验证', () => {
    // 第三方聚合站收录不能替代官方证据（不变量 4）
    const single = verifyAll([
      makeProject({ official: { website: 'https://demo.xyz' } }),
    ])[0];
    expect(isProjectVerified(single)).toBe(false);
  });

  it('两个不同域名的官方证据才算已验证', () => {
    const multi = verifyAll([
      makeProject({
        official: { website: 'https://demo.xyz', docs: 'https://docs.demo.xyz' },
      }),
    ])[0];
    expect(multi.evidence.filter((e) => e.verified).length).toBeGreaterThanOrEqual(2);
    expect(isProjectVerified(multi)).toBe(true);
  });

  it('buildEvidence 幂等', () => {
    const p = makeProject({ official: { website: 'https://demo.xyz' } });
    expect(buildEvidence(p)).toHaveLength(buildEvidence(p).length);
  });
});

describe('score 评分', () => {
  it('真实性：无证据时得分为 0', () => {
    const p = makeProject({ official: {} });
    expect(scoreAuthenticity(p, []).total).toBe(0);
  });

  it('真实性：潜在项目不会因缺少公告而拿满分', () => {
    const p = makeProject({
      status: 'potential',
      official: {
        website: 'https://demo.xyz',
        docs: 'https://docs.demo.xyz',
        github: 'https://github.com/demo',
      },
    });
    const ev = buildEvidence(p);
    const { total, items } = scoreAuthenticity(p, ev);
    expect(total).toBeLessThan(100);
    const ann = items.find((i) => i.key === 'authenticity.announcement');
    expect(ann?.value).toBe(0);
    expect(ann?.reason).toContain('尚未正式确认');
  });

  it('一票否决：索取私钥直接 critical', () => {
    const p = makeProject({
      tasks: ['输入私钥以领取空投'],
      requirements: ['钱包'],
    });
    const r = scoreRisk(p);
    expect(r.level).toBe('critical');
    expect(r.items.some((i) => i.key === 'risk.veto')).toBe(true);
  });

  it('系统生成的安全提示不应被误判为风险', () => {
    const p = makeProject({
      tasks: ['关注 X', '加入 Discord', '连接钱包'],
      guide: [
        {
          step: 1,
          title: '参与前准备',
          description: '不要输入助记词或私钥',
          official_url: '',
          minutes: 5,
          cost_usd: 0,
          needs_wallet: false,
          needs_signature: false,
          risk: 'low',
          done_when: '完成',
          source_verified: true,
        },
      ],
    });
    expect(scoreRisk(p).level).toBe('low');
  });

  it('价值等级映射', () => {
    expect(gradeOf(90)).toBe('S');
    expect(gradeOf(75)).toBe('A');
    expect(gradeOf(60)).toBe('B');
    expect(gradeOf(45)).toBe('C');
    expect(gradeOf(10)).toBe('D');
  });

  it('Critical 风险时不得推荐参与', () => {
    const r = buildRecommendation('S', 'critical');
    expect(r.action).toBe('avoid');
    expect(r.grade).toBe('D');
  });

  it('每个评分项都带解释', () => {
    const p = makeProject({ official: { website: 'https://demo.xyz' } });
    const withEv = { ...p, evidence: buildEvidence(p) };
    for (const item of scoreValue(withEv).items) {
      expect(item.reason.length).toBeGreaterThan(0);
      expect(item.max).toBeGreaterThan(0);
    }
  });
});

describe('validate 验收', () => {
  it('空数据集拒绝发布', () => {
    const r = validateProjects([]);
    expect(r.ok).toBe(false);
  });

  it('Critical 风险项目若推荐参与则校验失败', () => {
    const p = makeProject({
      scores: {
        authenticity: 10,
        value: 90,
        risk: 'critical',
        grade: 'D',
        authenticityItems: [{ key: 'a', label: 'a', value: 0, max: 1, reason: 'x' }],
        valueItems: [{ key: 'v', label: 'v', value: 0, max: 1, reason: 'x' }],
        riskItems: [{ key: 'r', label: 'r', value: 0, max: 1, reason: 'x' }],
      },
      recommendation: { grade: 'D', action: 'participate', summary: 'x' },
    });
    const r = validateProjects([p]);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('Critical Risk');
  });

  it('教程步骤必须可追溯', () => {
    const p = makeProject({
      guide: [
        {
          step: 1,
          title: 'x',
          description: 'y',
          official_url: '',
          minutes: 1,
          cost_usd: 0,
          needs_wallet: false,
          needs_signature: false,
          risk: 'low',
          done_when: 'z',
          source_verified: true,
        },
      ],
    });
    const r = validateProjects([p]);
    expect(r.errors.join()).toContain('教程步骤');
  });
});
