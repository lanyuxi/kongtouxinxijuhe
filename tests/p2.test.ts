/**
 * P2 体验细节回归：
 *   1. 筛选条件持久化（返回列表后不该重置）
 *   2. 骨架屏不再因筛选误闪
 *   3. 操作难度不再由「编造的耗时」推导
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { difficultyOf, DIFFICULTY_LABEL } from '../src/lib/difficulty';
import { loadFilters, persistFilters } from '../src/lib/store';
import { DEFAULT_FILTERS } from '../src/lib/filter';
import type { ListProject } from '../src/lib/types';

function makeListProject(over: Partial<ListProject> = {}): ListProject {
  return {
    id: 'demo',
    name: 'Demo',
    slug: 'demo',
    tagline: 't',
    category: 'DeFi',
    chains: ['Ethereum'],
    status: 'potential',
    official: {},
    tasks: [],
    requirements: [],
    sources: [],
    scores: { authenticity: 20, value: 50, risk: 'low', grade: 'C' },
    cost: {
      capital_min_usd: 0,
      capital_max_usd: 0,
      gas_estimate_usd: 0,
      time_minutes: 30,
      long_term: false,
      summary: 's',
    },
    recommendation: { grade: 'C', summary: 's', action: 'observe' },
    guide: [],
    guide_source: 'template',
    created_at: '2026-01-01T00:00:00Z',
    discovered_at: '2026-01-01T00:00:00Z',
    last_checked_at: '2026-01-01T00:00:00Z',
    last_changed_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const step = (over: Partial<ListProject['guide'][number]> = {}) => ({
  step: 1,
  title: 'x',
  minutes: 5,
  needs_wallet: false,
  needs_signature: false,
  risk: 'low' as const,
  ...over,
});

describe('P2 操作难度', () => {
  it('不再由 time_minutes 直接决定（时间由模板生成，不可信）', () => {
    // 两个项目 time_minutes 相同，但结构不同 → 难度必须不同
    const easy = makeListProject({ cost: { ...makeListProject().cost, time_minutes: 30 } });
    const hard = makeListProject({
      cost: { ...makeListProject().cost, time_minutes: 30, capital_max_usd: 500 },
      guide: Array.from({ length: 10 }, (_, i) => step({ step: i + 1, needs_signature: true })),
      tasks: ['跨链转移'],
      scores: { authenticity: 20, value: 50, risk: 'high', grade: 'C' },
    });
    expect(difficultyOf(easy)).toBeLessThan(difficultyOf(hard));
  });

  it('难度必须落在 1–5 之间且有中文标签', () => {
    const p = makeListProject();
    const d = difficultyOf(p);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(5);
    expect(DIFFICULTY_LABEL[d]).toBeTruthy();
  });

  it('每条判定条件都能提升难度（可解释）', () => {
    const base = makeListProject({ guide: [step()] });
    const d0 = difficultyOf(base);
    const withSig = difficultyOf(
      makeListProject({ guide: [step({ needs_signature: true })] }),
    );
    expect(withSig).toBeGreaterThan(d0);
    const withCapital = difficultyOf(
      makeListProject({ cost: { ...base.cost, capital_max_usd: 100 } }),
    );
    expect(withCapital).toBeGreaterThan(d0);
  });
});

describe('P2 筛选持久化', () => {
  beforeEach(() => {
    // 用最小 localStorage 替身，避免依赖浏览器环境
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;
  });

  it('保存后能读回（返回列表不再重置筛选）', () => {
    const next = { ...DEFAULT_FILTERS, chain: 'Solana', keyword: 'lido' };
    persistFilters(next);
    const loaded = loadFilters(DEFAULT_FILTERS);
    expect(loaded.chain).toBe('Solana');
    expect(loaded.keyword).toBe('lido');
  });

  it('没有存档时回落到默认值', () => {
    expect(loadFilters(DEFAULT_FILTERS)).toEqual(DEFAULT_FILTERS);
  });

  it('脏数据 / 多余字段不会污染筛选状态', () => {
    persistFilters({ chain: 'Solana', 未知字段: 'x' } as unknown as object);
    const loaded = loadFilters(DEFAULT_FILTERS);
    expect(loaded.chain).toBe('Solana');
    expect((loaded as unknown as Record<string, unknown>)['未知字段']).toBeUndefined();
  });

  it('损坏的 JSON 不会让筛选器崩掉', () => {
    localStorage.setItem('dropscope.filters.v1', '{oops');
    expect(loadFilters(DEFAULT_FILTERS)).toEqual(DEFAULT_FILTERS);
  });

  it('重置筛选后不应残留旧条件', () => {
    persistFilters({ ...DEFAULT_FILTERS, chain: 'Solana' });
    persistFilters(DEFAULT_FILTERS);
    expect(loadFilters(DEFAULT_FILTERS).chain).toBe('all');
  });
});

describe('P2 骨架屏不再因筛选误闪', () => {
  it('筛选是同步内存计算，computing 只在无数据时为真', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/pages/ListView.tsx', import.meta.url), 'utf8'),
    );
    // 旧实现：监听 filters 并 setTimeout(180) 强制闪骨架（已删除）
    expect(src).not.toMatch(/setComputing\(true\)/);
    // 依赖数组里不应再出现 filters（只有跟 filters 挂钩才会「改筛选就闪」）
    expect(src).not.toMatch(/\}, \[projects, filters/);
    // 新实现：computing 由「有没有数据」直接决定
    expect(src).toMatch(/const computing = projects\.length === 0/);
  });
});
