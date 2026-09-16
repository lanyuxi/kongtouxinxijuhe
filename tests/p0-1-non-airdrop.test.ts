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

describe('P0-1 发布门禁：在库条目不得命中非空投规则（审查员留的缺口）', () => {
  /**
   * 为什么这条断言必须存在（而不是只靠 prune）：
   *   `prune` 是**运行时单点**，且只在 `canPrune` 为真时才跑。
   *   抓取一旦抖动导致 canPrune 为 false，脏数据就会原样落盘并留在线上，
   *   等到下一轮健康抓取才可能被清掉。
   *   `validate` 里当时**没有**这条断言 —— 审查员明确提过，但一直没补上。
   */
  const mk = async (name: string, slug: string, categoryText: string) => {
    const { toSkeleton } = await import('../scripts/lib/merge');
    const base = toSkeleton({
      slug,
      name,
      tagline: '测试项目',
      status: 'potential',
      categoryText,
      chains: ['Ethereum'],
      sourceType: 'airdrop_aggregator',
      sourceName: 'Airdrops.io',
      sourceUrl: `https://airdrops.io/${slug}/`,
      fetchedAt: '2026-09-16T00:00:00.000Z',
      rawTitle: name,
    });
    return {
      ...base,
      scores: {
        ...base.scores,
        authenticityItems: [{ key: 'a', label: 'a', value: 1, max: 2, reason: 'x' }],
        valueItems: [{ key: 'v', label: 'v', value: 1, max: 2, reason: 'x' }],
        riskItems: [{ key: 'r', label: 'r', value: 1, max: 2, reason: 'x' }],
      },
      guide: [
        {
          step: 1,
          title: '步骤',
          description: '说明',
          official_url: 'https://d.xyz',
          minutes: 3,
          cost_usd: 0,
          needs_wallet: false,
          needs_signature: false,
          risk: 'low' as const,
          done_when: '完成',
          source_verified: false,
        },
      ],
    };
  };

  it('命中排除规则的条目会被 validate 拦下（发布门禁）', async () => {
    const { validateProjects } = await import('../scripts/lib/validate');
    const r = validateProjects(
      [await mk('Binance CEX', 'binance-cex', 'CEX'), await mk('Aave V3', 'aave-v3', 'Lending')] as never,
      new Set(),
    );
    expect(
      r.errors.some((e) => e.includes('binance-cex') && e.includes('非空投')),
      '交易所必须被发布门禁拦下',
    ).toBe(true);
    expect(
      r.errors.some((e) => e.includes('aave-v3') && e.includes('非空投')),
      '真实借贷协议不得被误伤',
    ).toBe(false);
  });

  it('人工档案登记过的项目豁免门禁（避免误杀 Gate 这类边界情况）', async () => {
    const { validateProjects } = await import('../scripts/lib/validate');
    const p = await mk('Gate', 'gate', 'CEX');
    expect(validateProjects([p] as never, new Set()).errors.some((e) => e.includes('非空投'))).toBe(true);
    expect(validateProjects([p] as never, new Set(['gate'])).errors.some((e) => e.includes('非空投'))).toBe(false);
  });

  /**
   * ⚠️ 审查员实证：旧规则下 73/120 条非空投语义条目全部漏拦，
   *    `live 命中规则 = 0/120` 不代表数据干净，而是规则没生效。
   *    根因是只按**名字**判定 —— 换个名字就漏。
   */
  it('按类目拦截，不依赖项目名（换名字也不漏）', async () => {
    const { classifyNonAirdrop } = await import('../scripts/lib/non-airdrop');
    const cases: [string, string][] = [
      ['Lido', 'Liquid Staking'],
      ['WBTC', 'Bridge'],
      ['LayerZero V2', 'Bridge'],
      ['EigenCloud', 'Restaking'],
      ['任意名字', 'Staking Pool'],
      ['任意名字', 'Risk Curators'],
    ];
    for (const [name, categoryText] of cases) {
      expect(
        classifyNonAirdrop({ name, categoryText }).excluded,
        `${categoryText} 类目必须被类目规则拦下（与名字无关）`,
      ).toBe(true);
    }
    // 真实空投叙事保留
    for (const [name, categoryText] of [['Aave V3', 'Lending'], ['Ethena', 'Basis Trading']] as [string, string][]) {
      expect(classifyNonAirdrop({ name, categoryText }).excluded).toBe(false);
    }
  });
});

describe('P0-1 豁免名单解析：结构异常时不得宽松放行', () => {
  /**
   * ⚠️ 真实缺陷（本轮自检发现）。
   *
   * `loadProfileSlugs` 曾写成「优先读 `data.profiles`，否则退回 `Object.keys(data)`」。
   * 档案文件本身带 `_comment` 说明字段，于是 `profiles` 一旦缺失或为 null，
   * 它会返回 `['_comment', 'profiles']` —— 把两个**非项目**的键当成豁免项。
   * 门禁看起来在工作，实际放行了一批不该放行的名字。
   *
   * 现在只认 `profiles` 这一层，结构不认识就返回空集合（不豁免任何条目）。
   */
  it('profiles 缺失 / 为 null / 结构异常时一律不豁免', async () => {
    const resolvers: (() => Promise<Set<string>>)[] = [];
    // 直接验证解析规则（与 scripts/validate.ts 的实现保持同口径）
    const resolve = (data: unknown): Set<string> => {
      const d = data as { profiles?: Record<string, unknown> } | null;
      if (!d || typeof d !== 'object' || typeof d.profiles !== 'object' || !d.profiles) {
        return new Set();
      }
      return new Set(Object.keys(d.profiles));
    };
    expect(resolve(null).size).toBe(0);
    expect(resolve({}).size).toBe(0);
    expect(resolve({ profiles: null }).size).toBe(0);
    expect(resolve({ _comment: '说明' }).size).toBe(0);
    expect(resolve({ _comment: '说明', profiles: {} }).size).toBe(0);
    expect(resolve({ _comment: '说明', profiles: { gate: {} } }).size).toBe(1);
    void resolvers;
  });

  it('真实档案文件解析出的豁免项都是项目 slug', async () => {
    const { readFile } = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const root = pathMod.resolve(__dirname, '..');
    const data = JSON.parse(
      await readFile(pathMod.join(root, 'data/seed/official-profiles.json'), 'utf8'),
    ) as { profiles?: Record<string, unknown> };
    const slugs = Object.keys(data.profiles ?? {});
    expect(slugs.length, '档案不应为空').toBeGreaterThan(0);
    // 说明性字段绝不能被当成项目 slug 参与豁免
    expect(slugs).not.toContain('_comment');
    expect(slugs).not.toContain('profiles');
  });
});

describe('P0-1 弱类目不得一刀切（独立审查否决了初版做法）', () => {
  /**
   * ⚠️ 这是本轮最重要的一条反向断言。
   *
   * 我曾把 Bridge / Liquid Staking / Restaking / Wrapped / Yield Aggregator /
   * Risk Curators 等 14 类一并加进类目强规则，理由是「桥与质押衍生品
   * 本身没有空投叙事」。
   *
   * 独立审查用真实数据否决了这个前提（不是风险推演，是活证据）：
   *   · `LayerZero`（Bridge）已发 ZRO 空投，库里状态是 `claim_live`；
   *   · `EigenLayer` / `EigenCloud`（Restaking）发过 6000 万美元空投；
   *   · `Lido` / `Rocket Pool` / `Stader` / `Kelp`（LST）、`Yearn`（Yield Aggregator）
   *     同样都有空投叙事。
   * 按 DefiLlama 全量（TVL ≥ $5M，845 条）实跑：14 类规则会把选中集
   * 从 682 条砍到 458 条，**净排除 224 条**，13 个类目被整类清空。
   *
   * 因此现在改为：弱类目**必须叠加「没有空投叙事证据」**才排除。
   */
  it('弱类目 + 有真实空投叙事 → 不得排除（LayerZero / EigenLayer 类）', async () => {
    const { classifyNonAirdrop } = await import('../scripts/lib/non-airdrop');
    const cases: [string, string, Record<string, unknown>][] = [
      ['LayerZero V2', 'Bridge', { status: 'claim_live' }],
      ['EigenCloud', 'Restaking', { tagline: 'EigenLayer 生态，已完成空投分发' }],
      ['Yearn Finance', 'Yield Aggregator', { tagline: '积分活动进行中，可领取奖励' }],
      ['Kelp', 'Liquid Restaking', { status: 'confirmed' }],
      ['Rocket Pool', 'Liquid Staking', { tagline: 'RPL 空投与质押激励' }],
    ];
    for (const [name, categoryText, extra] of cases) {
      const v = classifyNonAirdrop({ name, categoryText, ...extra });
      expect(v.excluded, `${name}（${categoryText}）是真实空投项目，不得被类目一刀切`).toBe(false);
    }
  });

  it('弱类目 + 完全没有空投叙事 → 才按基础设施 / 子池凭证排除', async () => {
    const { classifyNonAirdrop } = await import('../scripts/lib/non-airdrop');
    for (const [name, categoryText] of [
      ['Some Bridge Protocol', 'Bridge'],
      ['Wrapped Bitcoin Clone', 'Wrapped'],
      ['Random LST Pool', 'Liquid Staking'],
    ] as [string, string][]) {
      expect(classifyNonAirdrop({ name, categoryText }).excluded, `${categoryText} 无叙事应排除`).toBe(true);
    }
  });

  it('强类目（CEX / 中心化平台）不受叙事证据影响，一律排除', async () => {
    const { classifyNonAirdrop } = await import('../scripts/lib/non-airdrop');
    // 交易所即便文案里写了「空投」，也不是「一个可参与的活动」，而是交易场所
    for (const [name, categoryText] of [
      ['Binance CEX', 'CEX'],
      ['某中心化平台', 'Centralized Exchange'],
    ] as [string, string][]) {
      expect(
        classifyNonAirdrop({ name, categoryText, tagline: '平台空投活动' }).excluded,
        '强类目必须排除（叙事证据不能翻案）',
      ).toBe(true);
    }
  });

  it('类目规则不按名字判定（换名字也不漏）', async () => {
    const { classifyNonAirdrop } = await import('../scripts/lib/non-airdrop');
    expect(classifyNonAirdrop({ name: '任意名字', categoryText: 'CEX' }).excluded).toBe(true);
    expect(classifyNonAirdrop({ name: '任意名字', categoryText: 'Liquid Staking' }).excluded).toBe(true);
  });
});
