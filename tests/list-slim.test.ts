/**
 * 列表/详情拆分回归测试。
 *
 * 背景：首屏要整包下载 data/airdrops.json，实测 3.87 MB。
 * 逐字段拆解后体积几乎全部来自详情页专用字段
 * （digest / guide.description / scores.*Items / sourcedSteps / faq / evidence / risks）。
 *
 * 这里锁住两件事：
 *   1. 列表形态**必须**剔除这些重字段 —— 否则体积会悄悄涨回去；
 *   2. 列表与详情的**数值必须一致** —— 拆分绝不能改变任何结论。
 */
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { buildListDataset, toListProject, DETAIL_ONLY_FIELDS } from '../scripts/lib/list';
import { toSkeleton } from '../scripts/lib/merge';
import type { AirdropProject } from '../src/lib/types';

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
    fetchedAt: '2026-09-15T10:00:00.000Z',
    rawTitle: 'Demo Protocol',
  });
  return {
    ...base,
    digest: '{"huge":"fingerprint"}',
    sourcedSteps: [{ title: 'A', body: 'body', url: 'https://demo.xyz/a' }],
    evidence: [{ type: 'official_website', label: 'x', url: 'https://demo.xyz', verified: true }],
    faq: [{ q: 'q', a: 'a' }],
    risks: ['风险'],
    guide: [
      {
        step: 1,
        title: '参与前准备',
        description: '很长的描述',
        official_url: 'https://demo.xyz',
        minutes: 5,
        cost_usd: 0,
        needs_wallet: false,
        needs_signature: false,
        risk: 'low',
        done_when: '完成',
        source_verified: false,
      },
    ],
    ...over,
  };
}

describe('列表瘦身', () => {
  it('剔除全部详情专用重字段', () => {
    const list = toListProject(makeProject());
    for (const f of DETAIL_ONLY_FIELDS) {
      expect(list).not.toHaveProperty(f);
    }
    // 教程只保留渲染/判定需要的字段，不再携带大段文案与来源
    const step = list.guide[0] as Record<string, unknown>;
    expect(step).not.toHaveProperty('description');
    expect(step).not.toHaveProperty('done_when');
    expect(step).toHaveProperty('title');
    expect(step).toHaveProperty('needs_signature');
  });

  it('评分明细（*Items）不下发到列表', () => {
    const p = makeProject({
      scores: {
        authenticity: 30,
        value: 55,
        risk: 'medium',
        grade: 'B',
        authenticityItems: [{ key: 'a', label: 'a', value: 1, max: 2, reason: 'r' }],
        valueItems: [{ key: 'v', label: 'v', value: 1, max: 2, reason: 'r' }],
        riskItems: [{ key: 'r', label: 'r', value: 1, max: 2, reason: 'r' }],
      },
    });
    const list = toListProject(p);
    expect(list.scores).toEqual({
      authenticity: 30,
      value: 55,
      risk: 'medium',
      grade: 'B',
    });
  });

  it('列表与详情的数值必须完全一致（拆分不得改变任何结论）', () => {
    const p = makeProject({
      scores: {
        authenticity: 42,
        value: 61,
        risk: 'high',
        grade: 'B',
        authenticityItems: [],
        valueItems: [],
        riskItems: [],
      },
    });
    const list = toListProject(p);
    expect(list.scores.authenticity).toBe(p.scores.authenticity);
    expect(list.scores.value).toBe(p.scores.value);
    expect(list.scores.risk).toBe(p.scores.risk);
    expect(list.scores.grade).toBe(p.scores.grade);
    expect(list.cost).toEqual(p.cost);
    expect(list.recommendation).toEqual(p.recommendation);
    expect(list.sources).toEqual(p.sources);
    expect(list.chains).toEqual(p.chains);
  });

  it('列表形态确实比完整形态小很多', () => {
    const p = makeProject();
    const full = Buffer.byteLength(JSON.stringify(p));
    const slim = Buffer.byteLength(JSON.stringify(toListProject(p)));
    expect(slim).toBeLessThan(full);
  });

  it('buildListDataset 保留 updated_at / new_today 协议字段', () => {
    const ds = buildListDataset([makeProject()], {
      updated_at: '2026-09-15T00:00:00.000Z',
      new_today: 3,
    });
    expect(ds.updated_at).toBe('2026-09-15T00:00:00.000Z');
    expect(ds.new_today).toBe(3);
    expect(ds.projects).toHaveLength(1);
  });
});

describe('P1-2 数据集公链覆盖回归', () => {
  it('真实数据集里「未标注」公链占比必须很低', () => {
    // 历史问题：65.6% 的项目公链显示「其他公链」，公链筛选器形同虚设。
    // 修复后实测降到 3/189。这里设一个宽松阈值，防止回归到「大面积 Other」。
    const fs = require('node:fs') as typeof import('node:fs');
    const dir = resolve(__dirname, '../data/details');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    if (files.length < 20) return;
    let otherOnly = 0;
    for (const f of files) {
      const p = JSON.parse(fs.readFileSync(join(dir, f), 'utf8'));
      if ((p.chains ?? []).every((c: string) => c === 'Other')) otherOnly += 1;
    }
    expect(otherOnly / files.length).toBeLessThan(0.1);
  });
});

describe('P0-2 后续：校验脚本必须读完整分片', () => {
  it('scripts/validate.ts 不得再从 airdrops.json 读项目', async () => {
    // 历史事故：列表瘦身后 validate 仍读 airdrops.json，
    // `p.evidence.filter` 抛错，GitHub Pages 的「发布前校验」整步失败、
    // 部署被跳过（用户看到的是站点不更新）。
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../scripts/validate.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/readFullProjects/);
    expect(src).not.toMatch(/validateProjects\(dataset\.projects\)/);
    expect(src).not.toMatch(/validateLogoCoverage\(dataset\.projects/);
  });

  it('完整分片存在时，校验必需的字段一个都不能少', async () => {
    const fs = await import('node:fs');
    const fsp = await import('node:fs/promises');
    const dir = resolve(__dirname, '../data/details');
    if (!fs.existsSync(dir)) return;
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
    if (files.length === 0) return;
    // 抽查前 5 个分片：校验逻辑依赖 evidence / guide / scores 明细
    for (const f of files.slice(0, 5)) {
      const p = JSON.parse(await fsp.readFile(join(dir, f), 'utf8'));
      expect(Array.isArray(p.evidence)).toBe(true);
      expect(Array.isArray(p.guide)).toBe(true);
      expect(p.scores.authenticityItems).toBeDefined();
    }
  });
});
