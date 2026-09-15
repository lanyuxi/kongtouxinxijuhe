import { describe, it, expect } from 'vitest';
import { normalize, normalizeChainList, normalizeStatus, slugify } from '../scripts/lib/normalize';
import { mergeAll, mergeProject } from '../scripts/lib/merge';
import { buildEvidence, isProjectVerified, verifyAll } from '../scripts/lib/verify';
import {
  buildRecommendation,
  gradeOf,
  parseTvlMillions,
  scoreAuthenticity,
  scoreRisk,
  scoreValue,
} from '../scripts/lib/score';
import { validateProjects } from '../scripts/lib/validate';
import type { AirdropProject, Chain } from '../src/lib/types';
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
    // 阈值已按真实分布重新校准（见 GRADE_THRESHOLDS 注释）：
    // 旧阈值导致 79% 项目同为 C、S/A 一个都出不来。
    expect(gradeOf(90)).toBe('S');
    expect(gradeOf(60)).toBe('S');
    expect(gradeOf(58)).toBe('A');
    expect(gradeOf(53)).toBe('B');
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
      guide_source: 'sourced',
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

  it('「已核实」但无来源链接的步骤必须被判为假核实', () => {
    const p = makeProject({
      guide_source: 'sourced',
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
          // 故意不提供 source_url
        },
      ],
    });
    const r = validateProjects([p]);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('缺少来源链接');
  });

  it('模板教程一律不得自称「来源已核实」', () => {
    const p = makeProject({
      guide_source: 'template',
      guide: [
        {
          step: 1,
          title: 'x',
          description: 'y',
          official_url: 'https://demo.xyz',
          minutes: 1,
          cost_usd: 0,
          needs_wallet: false,
          needs_signature: false,
          risk: 'low',
          done_when: 'z',
          source_url: 'https://demo.xyz',
          source_verified: true,
        },
      ],
    });
    const r = validateProjects([p]);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('谎称');
  });
});

describe('P1-1 风险误报修复', () => {
  it('「涉及 LP / Farming / 质押」不再直接判 HIGH', () => {
    // DeFi 空投的标准动作（Aave / Pendle / EigenLayer 全都命中）。
    // 判 HIGH 会让几乎每个 DeFi 项目变红，真正的危险信号被淹没。
    const p = makeProject({ tasks: ['提供流动性', '质押资产'] });
    const r = scoreRisk(p);
    expect(r.level).not.toBe('high');
    expect(r.items.some((i) => i.label === '涉及 LP / Farming / 质押')).toBe(true);
  });

  it('「合约未覆盖」不提升风险等级，只作为数据覆盖说明', () => {
    // 实测 189 个项目里有合约证据的为 0 —— 该条件对所有项目都成立，
    // 用它判 HIGH 等于全量刷红，属于系统性误报。
    const p = makeProject({ tasks: ['执行交易', '提供流动性'] });
    const r = scoreRisk(p);
    expect(r.level).not.toBe('high');
    const item = r.items.find((i) => i.key === 'risk.contract_coverage');
    expect(item?.value).toBe(0);
  });

  it('真正的不可逆损失（下载来源不明客户端）仍判 HIGH', () => {
    const p = makeProject({ tasks: ['下载客户端并安装'] });
    expect(scoreRisk(p).level).toBe('high');
  });

  it('一票否决优先级最高（索取私钥 → critical）', () => {
    const p = makeProject({ tasks: ['提供流动性'], tagline: '请输入你的私钥' });
    const r = scoreRisk(p);
    expect(r.level).toBe('critical');
    expect(r.items.some((i) => i.key === 'risk.veto')).toBe(true);
  });

  it('高风险不再刷屏：LP/质押类项目不应集中在 high', () => {
    // 模拟一批典型 DeFi 动作，验证等级具备区分度
    const samples = [
      makeProject({ slug: 'a', tasks: ['提供流动性', '质押资产'] }),
      makeProject({ slug: 'b', tasks: ['执行交易', '跨链转移'] }),
      makeProject({ slug: 'c', tasks: ['存入资产', '借出资产'] }),
    ];
    const levels = samples.map((p) => scoreRisk(p).level);
    expect(levels.filter((l) => l === 'high')).toHaveLength(0);
  });
});

describe('P1-2 公链归一修复', () => {
  it('多链字符串必须被拆分，不能整体落进 Other', () => {
    // 根因：抓取侧把 chains 数组 join 成 "Avalanche, Polygon, Ethereum"，
    // 旧实现把整串当一个 key 查表 → 100% 变 Other。
    expect(normalizeChainList('Avalanche, Polygon, Ethereum')).toEqual([
      'Avalanche',
      'Polygon',
      'Ethereum',
    ]);
    expect(normalizeChainList('Ethereum、Base')).toEqual(['Ethereum', 'Base']);
  });

  it('未收录的链保留原始名，而不是一律折叠成 Other', () => {
    // 别名表是「规范化」不是「白名单」：把 Astar 说成「其他公链」会丢信息
    expect(normalizeChainList('Astar')).toEqual(['Astar']);
    expect(normalizeChainList('Some New Chain')).toEqual(['Some New Chain']);
  });

  it('常见别名归一', () => {
    expect(normalizeChainList('eth')).toEqual(['Ethereum']);
    expect(normalizeChainList('bsc')).toEqual(['BNB Chain']);
    expect(normalizeChainList('matic')).toEqual(['Polygon']);
    expect(normalizeChainList('avax')).toEqual(['Avalanche']);
  });

  it('真正未知时才返回 Other', () => {
    expect(normalizeChainList(undefined)).toEqual(['Other']);
    expect(normalizeChainList('')).toEqual(['Other']);
    expect(normalizeChainList('Other')).toEqual(['Other']);
  });

  it('有已知链时不得保留 Other 占位（避免自相矛盾）', () => {
    // chains=['Other','Ethereum'] 是矛盾的：既然知道是 Ethereum，就不存在未知链
    expect(normalizeChainList('Other, Ethereum')).toEqual(['Ethereum']);
  });

  it('大小写与多分隔符混用时仍能正确归一', () => {
    expect(normalizeChainList('ETHEREUM, base')).toEqual(['Ethereum', 'Base']);
    expect(normalizeChainList('Ethereum，Base、Arbitrum/OP')).toEqual([
      'Ethereum',
      'Base',
      'Arbitrum',
      'Optimism',
    ]);
    expect(normalizeChainList('Ethereum, Ethereum')).toEqual(['Ethereum']);
  });

  it('未识别链保留原始书写（不把 SuperNewChain 改成 Supernewchain）', () => {
    expect(normalizeChainList('SuperNewChain')).toEqual(['SuperNewChain']);
    expect(normalizeChainList('astar')).toEqual(['Astar']);
  });
});

describe('P1-2 公链合并时 Other 不应粘住', () => {
  it('补全真实公链后必须丢掉 Other 占位', () => {
    // 根因：链信息会随时间被补全，若只做并集，'Other' 会永久残留，
    // 实测 121 个项目同时带 'Other' 与真实链，卡片上又出现「其他公链」。
    const base = makeProject({ chains: ['Other'] as Chain[] });
    const merged = mergeProject(base, {
      slug: 'demo',
      name: 'Demo Protocol',
      tagline: 't',
      status: 'potential',
      categoryText: 'DeFi',
      chains: ['Ethereum', 'Base'],
      sourceType: 'third_party',
      sourceName: 'DefiLlama',
      sourceUrl: 'https://defillama.com/protocol/demo',
      fetchedAt: now,
      tagline2: undefined,
    } as never);
    expect(merged.chains).toContain('Ethereum');
    expect(merged.chains).toContain('Base');
    expect(merged.chains).not.toContain('Other');
  });
});

describe('P1-3 参与价值评分区分度', () => {
  it('等级必须单调（分数越高等级越高）', () => {
    const order = { S: 4, A: 3, B: 2, C: 1, D: 0 } as const;
    let prev = -1;
    for (let v = 0; v <= 100; v++) {
      const r = order[gradeOf(v)];
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('TVL 可解析，用于规模分（唯一有真实数量级的客观字段）', () => {
    expect(parseTvlMillions('Lending 协议，TVL 约 $261M。')).toBe(261);
    expect(parseTvlMillions('Liquid Staking 协议，TVL 约 $24046M。')).toBe(24046);
    expect(parseTvlMillions('没有数据')).toBeNull();
  });

  it('规模不同的项目必须得到不同的价值分（不再全是同一个值）', () => {
    // 根因：旧模型七项里有五项是固定常数，普通项目一律 49 分（146/189 同分）。
    const big = makeProject({
      tagline: 'Lending 协议，TVL 约 $24000M。',
      status: 'confirmed',
      evidence: [
        { type: 'official_website', label: 'a', url: 'https://demo.xyz', verified: true },
        { type: 'official_x', label: 'b', url: 'https://x.com/demo', verified: true },
        { type: 'third_party', label: 'c', url: 'https://d.com', verified: true },
      ],
      sources: [
        { type: 'third_party', name: 'A', url: 'https://a.com', fetched_at: now },
        { type: 'third_party', name: 'B', url: 'https://b.com', fetched_at: now },
        { type: 'airdrop_aggregator', name: 'C', url: 'https://c.com', fetched_at: now },
      ],
    });
    const small = makeProject({ tagline: '一个新项目，TVL 约 $6M。', status: 'new' });
    const a = scoreValue(big).total;
    const b = scoreValue(small).total;
    expect(big.status === 'confirmed').toBe(true);
    expect(a).toBeGreaterThan(b);
  });

  it('缺失数据要给 0 分并说明原因，而不是用常数抬高总分', () => {
    const p = makeProject();
    const items = scoreValue(p).items;
    const scale = items.find((i) => i.key === 'value.scale');
    expect(scale?.value).toBe(0);
    expect(scale?.reason).toContain('未获取');
  });
});

describe('P1-3 结论与等级一致性', () => {
  it('D 级的动作必须是 avoid（不能与「不值得投入」的文案矛盾）', () => {
    const r = buildRecommendation('D', 'low');
    expect(r.action).toBe('avoid');
    expect(r.summary).toContain('不值得');
  });

  it('S/A 级建议参与，B/C 级观察', () => {
    expect(buildRecommendation('S', 'low').action).toBe('participate');
    expect(buildRecommendation('A', 'low').action).toBe('participate');
    expect(buildRecommendation('B', 'low').action).toBe('observe');
    expect(buildRecommendation('C', 'low').action).toBe('observe');
  });
});
