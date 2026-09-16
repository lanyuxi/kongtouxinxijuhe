/**
 * P0-1｜非空投条目治理（对应上轮审查 BUG-1）。
 *
 * 实测问题（2026-09-15 审查 + 2026-09-16 复核）：
 *   1. `scripts/fetch/defillama.ts` 里写好的排除规则**从未被回填应用到已有库**，
 *      于是 `data/details/` 里长期残留 56 个「已出库条目」的分片文件
 *      （binance-cex / okx / gemini / base-bridge / blog / faq …）。
 *      这些分片包含 recommendation.action = 'participate'，只要有任何
 *      基于 data/details/ 的消费方，就会把「Binance CEX」当成可参与的空投。
 *   2. Prune 只认「连续 N 轮缺席」，不认「来源类型已停收」——
 *      一旦某个条目由 Airdrops.io 提供而该来源下线，它会永远留在库里。
 *   3. 前端 `buildOfficialDomains` 会把所有条目的官网收进「官方域名库」，
 *      被下架的交易所域名仍在其中，用户拿真域名去自查会被判「无法确认」。
 */
import { describe, it, expect } from 'vitest';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  EXCLUDE_PATTERNS,
  classifyNonAirdrop,
  isNonAirdropName,
} from '../scripts/lib/non-airdrop';
import { pruneProjects } from '../scripts/lib/prune';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';

const now = '2026-09-16T00:00:00.000Z';

function make(over: Partial<AirdropProject> & { slug: string; name: string }): AirdropProject {
  const base = toSkeleton({
    slug: over.slug,
    name: over.name,
    tagline: '测试',
    status: 'potential',
    categoryText: 'DeFi',
    chains: ['Ethereum'],
    sourceType: 'third_party',
    sourceName: 'DefiLlama',
    sourceUrl: `https://defillama.com/protocol/${over.slug}`,
    fetchedAt: now,
    rawTitle: over.name,
  });
  return { ...base, ...over };
}

describe('P0-1 非空投条目识别', () => {
  it('中心化交易所 / 跨链桥 / 质押衍生品一律判为「非空投条目」', () => {
    const bad = [
      'Binance CEX',
      'OKX',
      'Gemini',
      'MEXC',
      'Robinhood',
      'Bitfinex',
      'Gate',
      'Base Bridge',
      'Arbitrum Bridge',
      'Lighter Bridge',
      'Binance Staked ETH',
      'Coinbase Wrapped Staked ETH',
      'ether.fi Liquid',
      'Jito Liquid Staking',
      'HyperLend Pooled',
    ];
    for (const name of bad) {
      expect(isNonAirdropName(name), `${name} 应被判为非空投条目`).toBe(true);
    }
  });

  it('裸词规则不得误伤以 index / vault / liquid 命名的真实项目（独立审查发现）', () => {
    // 独立审查（2026-09-16）实测到的过度匹配：
    //   `Index Coop`   ← 被 /\bindex\b/ 误删（真实指数协议）
    //   `Vault Street` ← 被 /\bvault\b/ 误删（真实收益协议）
    // 修复方式：裸词规则保留 + 已核实豁免名单（而非把规则改松，
    // 否则真正的「指数类目」条目会漏拦）。
    expect(isNonAirdropName('Index Coop')).toBe(false);
    expect(isNonAirdropName('Vault Street')).toBe(false);
    // 该排除的仍要排除（不能为了不误伤而放弃拦截）
    expect(isNonAirdropName('ether.fi Liquid')).toBe(true);
    expect(isNonAirdropName('Polygon Bridge')).toBe(true);
    expect(isNonAirdropName('Jito Liquid Staking')).toBe(true);
  });

  it('真实空投项目不会被误伤（含 "x.com" 子串类误判点）', () => {
    const good = [
      'Fraxtal',
      'Aave V3',
      'Monad',
      'EigenLayer',
      'Pendle',
      'Ethena',
      'Grass',
      'Jupiter',
      'Sanctum Infinity',
      'Kamino Lend',
      'Morpho Blue',
      'World Chain',
      'Stader',
    ];
    for (const name of good) {
      expect(isNonAirdropName(name), `${name} 不应被误判`).toBe(false);
    }
  });

  it('排除规则必须覆盖中心化交易所类目（category 优先，不只看 name）', () => {
    const verdict = classifyNonAirdrop({ name: '某某平台', categoryText: 'CEX' });
    expect(verdict.excluded).toBe(true);
    expect(verdict.reason).toContain('交易所');
  });

  it('命中的排除原因可解释（可展示给人工复核）', () => {
    const verdict = classifyNonAirdrop({ name: 'Binance CEX' });
    expect(verdict.excluded).toBe(true);
    expect(verdict.reason).toBeTruthy();
    expect(verdict.pattern).toBeTruthy();
  });

  it('EXCLUDE_PATTERNS 必须是非空的可迭代集合', () => {
    expect(EXCLUDE_PATTERNS.length).toBeGreaterThan(5);
  });
});

describe('P0-1 Prune：来源停收不再无限保留', () => {
  it('无官方证据、本轮缺席、来源为第三方事实源 → 达到阈值即清理', () => {
    const p = make({ slug: 'some-cex', name: 'Some CEX' });
    p.miss_streak = 1;
    const r = pruneProjects([p], new Set<string>(), true, new Set<string>());
    expect(r.removed).toContain('some-cex');
    expect(r.projects).toHaveLength(0);
  });

  it('有官方证据的真项目仍然保留（不因来源波动被删）', () => {
    const p = make({ slug: 'real-project', name: 'Real Project' });
    p.evidence = [
      { type: 'official_website', label: '官网', url: 'https://real.xyz', verified: true },
      { type: 'official_docs', label: '文档', url: 'https://docs.real.xyz', verified: true },
    ];
    p.miss_streak = 9;
    const r = pruneProjects([p], new Set<string>(), true, new Set<string>());
    expect(r.removed).not.toContain('real-project');
  });

  it('来源整体不健康时绝不清理（避免把抓取失败当成「已下架」）', () => {
    const p = make({ slug: 'some-cex', name: 'Some CEX' });
    p.miss_streak = 5;
    const r = pruneProjects([p], new Set<string>(), false, new Set<string>());
    expect(r.removed).toHaveLength(0);
  });

  it('名字命中非空投规则的条目，即使有官网也立即出库', () => {
    const p = make({ slug: 'binance-cex', name: 'Binance CEX' });
    p.evidence = [
      { type: 'official_website', label: '官网', url: 'https://www.binance.com', verified: true },
      { type: 'official_x', label: 'X', url: 'https://x.com/binance', verified: true },
    ];
    const r = pruneProjects([p], new Set<string>(), true, new Set<string>());
    expect(r.removed).toContain('binance-cex');
  });
});

describe('P0-1 数据分片卫生：出库条目不得残留 data/details', () => {
  it('data/details 下不存在未在 airdrops.json 中的孤儿分片', async () => {
    const { readFile } = await import('node:fs/promises');
    const root = path.resolve(__dirname, '..');
    const dataset = JSON.parse(
      await readFile(path.join(root, 'data/airdrops.json'), 'utf8'),
    ) as { projects: AirdropProject[] };
    const slugs = new Set(dataset.projects.map((p) => p.slug));
    const files = await readdir(path.join(root, 'data/details'));
    const orphans = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .filter((slug) => !slugs.has(slug));
    expect(orphans, `以下分片已出库但仍残留：${orphans.join('、')}`).toEqual([]);
  });
});

describe('P0-1 前端官方域名库不得收录非空投条目', () => {
  it('buildOfficialDomains 只收「真项目」的官网', async () => {
    const { buildOfficialDomains } = await import('../src/lib/scam');
    const projects = [
      { slug: 'binance-cex', name: 'Binance CEX', official: { website: 'https://www.binance.com' } },
      { slug: 'fraxtal', name: 'Fraxtal', official: { website: 'https://frax.com/' } },
    ];
    const map = buildOfficialDomains(projects);
    expect(map['binance.com']).toBeUndefined();
    expect(map['frax.com']).toBe('Fraxtal');
  });
});
