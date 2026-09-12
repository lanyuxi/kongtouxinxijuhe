/**
 * 「一键更新」相关逻辑测试。
 *
 * 重点覆盖容易出错、且一旦出错会让用户「以为按钮坏了」的分支：
 *   - 新鲜度判定（决定按钮是否高亮）
 *   - 清理策略（决定是否会误删真实项目）
 *   - 操作摘要生成（决定卡片是否会出现空白或千篇一律）
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStale, STALE_MINUTES } from '../src/lib/refresh';
import { canPrune, pruneProjects } from '../scripts/lib/prune';
import { tasksFromSource, stepsFromSource } from '../scripts/lib/sourced';
import { operationSummary, operationLine } from '../src/lib/tasks';
import { normalizeCategory } from '../scripts/lib/normalize';
import { toSkeleton } from '../scripts/lib/merge';
import type { AirdropProject, LiveIndex } from '../src/lib/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NOW = new Date('2026-09-12T10:00:00.000Z').getTime();

function makeIndex(updatedAt: string): LiveIndex {
  return { updated_at: updatedAt, total: 1, sources: [] };
}

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
    fetchedAt: '2026-09-12T09:00:00.000Z',
    rawTitle: 'Demo Protocol',
  });
  return { ...base, ...over };
}

describe('数据新鲜度判定', () => {
  it('刚更新的数据不算过期', () => {
    expect(isStale(makeIndex(new Date(NOW - 60_000).toISOString()), NOW)).toBe(false);
  });

  it('超过 STALE_MINUTES 判定为过期', () => {
    const old = new Date(NOW - (STALE_MINUTES + 1) * 60_000).toISOString();
    expect(isStale(makeIndex(old), NOW)).toBe(true);
  });

  it('无数据时视为过期（提示用户刷新）', () => {
    expect(isStale(null, NOW)).toBe(true);
  });

  it('时间非法时按过期处理，不能当作新鲜数据', () => {
    expect(isStale(makeIndex('not-a-date'), NOW)).toBe(true);
  });
});

describe('清理策略', () => {
  it('本轮无任何来源产出时不清理（避免清空全库）', () => {
    expect(canPrune([{ ok: false, fetched: 0 }])).toBe(false);
    expect(canPrune([])).toBe(false);
  });

  it('有来源产出即可清理，不要求所有来源都成功', () => {
    // Galxe 长期不可用属已知情况，不应因此永久无法清理历史垃圾数据
    expect(canPrune([{ ok: true, fetched: 10 }, { ok: false, fetched: 0 }])).toBe(true);
  });

  it('已知运营页会被清理', () => {
    const blog = makeProject({ slug: 'blog', name: 'Blog' });
    const result = pruneProjects([blog], new Set(), true, new Set());
    expect(result.removed).toContain('blog');
    expect(result.projects).toHaveLength(0);
  });

  it('有官方证据的真项目不会被清理（来源波动不应导致删除）', () => {
    const real = makeProject({
      slug: 'real-project',
      evidence: [
        { type: 'official_website', label: '官网', url: 'https://real.xyz', verified: true },
        { type: 'official_docs', label: '文档', url: 'https://docs.real.xyz', verified: true },
      ],
    });
    const result = pruneProjects([real], new Set(), true, new Set());
    expect(result.removed).toHaveLength(0);
    expect(result.projects).toHaveLength(1);
  });

  it('人工档案登记过的项目不会被清理', () => {
    const p = makeProject({ slug: 'curated' });
    const result = pruneProjects([p], new Set(), true, new Set(['curated']));
    expect(result.projects).toHaveLength(1);
  });

  it('连续缺席达到阈值才清理，单轮缺席不删', () => {
    const p = makeProject({ slug: 'flaky', evidence: [] });
    const first = pruneProjects([p], new Set(), true, new Set());
    expect(first.projects).toHaveLength(1); // 第一轮保留，只累计缺席

    const second = pruneProjects(first.projects, new Set(), true, new Set());
    expect(second.removed).toContain('flaky'); // 第二轮才清理
  });

  it('本轮被提及会清零缺席计数', () => {
    const p = makeProject({ slug: 'flaky', evidence: [] });
    const first = pruneProjects([p], new Set(), true, new Set());
    expect(first.projects[0].miss_streak).toBe(1);

    const back = pruneProjects(first.projects, new Set(['flaky']), true, new Set());
    expect(back.projects[0].miss_streak).toBeUndefined();
  });
});

describe('操作摘要', () => {
  it('按协议类型推断出具体任务，不落入「研究项目」兜底', () => {
    expect(tasksFromSource('Lending')).toContain('存入资产');
    expect(tasksFromSource('Dexs')).toContain('执行交易');
    expect(tasksFromSource('Liquid Staking')).toContain('质押资产');
    expect(tasksFromSource('未知类型')).toEqual([]);
  });

  it('真实步骤会被转成中文动作短语', () => {
    const p = makeProject({
      sourcedSteps: [
        { title: 'Step 1: Join the waitlist', body: 'Sign up' },
        { title: 'Step 2: Follow on X', body: 'Follow us' },
        { title: 'Step 3: Invite friends', body: 'Share link' },
      ],
    });
    const steps = stepsFromSource(p);
    expect(steps).toHaveLength(3);
    // 真实步骤进入 guide 后，卡片摘要应来自这些真实动作，而不是兜底文案
    const summary = operationSummary({ ...p, guide: steps });
    expect(summary).toContain('注册账号');
    expect(summary).toContain('关注 X');
    expect(summary).not.toContain('研究项目，择机参与');
  });

  it('没有任何线索时给出可读兜底，保证卡片不出现空行', () => {
    const p = makeProject({ tasks: [], guide: [], status: 'claim_live' });
    expect(operationSummary(p).length).toBeGreaterThan(0);
    expect(operationLine(p)).toContain('操作：');
  });

  it('中文任务标签可直接复用', () => {
    const p = makeProject({ tasks: ['存入资产', '持有份额'] });
    expect(operationSummary(p)).toEqual(['存入资产', '持有份额']);
  });
});

describe('类目归一', () => {
  it('上游细分类目能映射到内部粗分类', () => {
    expect(normalizeCategory('Liquid Staking')).toBe('DeFi');
    expect(normalizeCategory('RWA')).toBe('DeFi');
    expect(normalizeCategory('Rollup')).toBe('L2');
    expect(normalizeCategory('ai agents')).toBe('AI');
    expect(normalizeCategory('gaming')).toBe('GameFi');
  });

  it('无法识别时返回 Other，而不是乱猜', () => {
    expect(normalizeCategory('some-unknown-category')).toBe('Other');
    expect(normalizeCategory(undefined)).toBe('Other');
  });
});

describe('一键更新 · 数据加载路径一致性（Issue #1 回归）', () => {
  it('刷新用的 reloadDataset 必须复用 loadDataset，不能直接返回裸 airdrops.json', async () => {
    const src = await readFile(path.join(ROOT, 'src/lib/refresh.ts'), 'utf8');

    // airdrops.json 里不含 logo 字段，logo 是在 data.ts 里由 logo-map.json 拼上去的。
    // 曾经的 BUG：reloadDataset 直接 fetchNoCache<Dataset>('airdrops.json')，
    // 结果「一键更新」后所有项目丢 logo，列表页图标整排消失。
    expect(src).toMatch(/import\s*\{[^}]*loadDataset[^}]*\}\s*from\s*'\.\/data'/);
    expect(src).toMatch(/loadDataset\(\)/);
    expect(src).not.toMatch(
      /reloadDataset[\s\S]{0,400}?fetchNoCache<Dataset>\('airdrops\.json'\)/,
    );
  });

  it('两个数据入口返回的项目都必须带 logo', async () => {
    const dataset = JSON.parse(
      await readFile(path.join(ROOT, 'data/airdrops.json'), 'utf8'),
    ) as { projects: { slug: string; logo?: string }[] };
    const map = JSON.parse(await readFile(path.join(ROOT, 'data/logo-map.json'), 'utf8')) as {
      logos: Record<string, string>;
    };

    // 模拟 data.ts 的 loadDataset 拼装逻辑（初始加载与刷新后共用同一条路径）
    const decorate = (projects: { slug: string; logo?: string }[]) =>
      projects.map((p) => (map.logos[p.slug] ? { ...p, logo: map.logos[p.slug] } : p));

    for (const p of decorate(dataset.projects)) {
      expect(p.logo, `${p.slug} 缺少 logo（刷新后会整排消失）`).toBeTruthy();
    }
  });
});
