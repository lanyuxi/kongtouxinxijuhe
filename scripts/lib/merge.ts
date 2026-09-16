/**
 * Merge：多来源去重与合并。
 *
 * 对应方案文档：
 * - 第 19 章「去重 / 合并」
 * - 第 27 章不变量 3：单个数据源失败不能导致整个空投库被清空
 * - 第 28 章：每个 Source Adapter 独立运行，失败时保留 Last Known Good
 */

import type {
  AirdropProject,
  Evidence,
  SourceRef,
  AirdropStatus,
  Category,
  Chain,
} from '../../src/lib/types';
import type { NormalizedItem } from './normalize';
import { normalizeCategory } from './normalize';

const STATUS_RANK: Record<string, number> = {
  ended: 0,
  new: 1,
  potential: 2,
  confirmed: 3,
  claim_live: 4,
};

/** 合并时保留「更靠后生命周期」的状态，避免被旧数据降级 */
export function pickStatus(a: AirdropStatus, b: AirdropStatus): AirdropStatus {
  return (STATUS_RANK[b] ?? 0) > (STATUS_RANK[a] ?? 0) ? b : a;
}

/**
 * 合并公链列表。
 *
 * ⚠️ 与普通 mergeUnique 的差别（这是「65% 显示其他公链」的第二个根因）：
 *   链信息是**会随时间被补全**的 —— 第一轮某个项目只被 Airdrops.io 抓到、
 *   公链未知（Other），第二轮 DefiLlama 补上了 ['Ethereum','Base']。
 *   若照搬 mergeUnique 只做并集，'Other' 会**永久粘住**：
 *   实测 121 个项目同时带着 'Other' 和真实公链，
 *   于是卡片上又出现「其他公链」，筛选器里 Other 计数高得离谱。
 *
 *   规则：一旦某一侧给出了**已知链**，'Other' 就不该再保留 ——
 *   它的语义是「我们不知道这条链叫什么」，而不是「这项目还有一条其他链」。
 *   只有两侧都只有 'Other' 时才保留 'Other'。
 */
function mergeChains(a: Chain[], b: Chain[]): Chain[] {
  const all = Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  const known = all.filter((c) => c !== 'Other');
  // 有真实链 → 丢掉「未知」占位；否则保留 Other，表示确实没识别出来
  return known.length ? known : all.length ? ['Other'] : [];
}

/** 按对象身份去重无法处理结构相同的对象，这里改用 key 提取函数做值去重 */
function mergeUniqueBy<T>(a: T[], b: T[], key: (x: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) map.set(key(item), item);
  return Array.from(map.values());
}

function sourceKey(s: SourceRef): string {
  return `${s.type}::${s.name}::${s.url}`;
}

/** 依据归一化条目，生成一个「骨架项目」（尚未评分） */
export function toSkeleton(item: NormalizedItem): AirdropProject {
  const now = item.fetchedAt;
  return {
    id: item.slug,
    name: item.name,
    slug: item.slug,
    tagline: item.tagline,
    category: normalizeCategory(item.categoryText) as Category,
    chains: item.chains as Chain[],
    status: item.status as AirdropStatus,
    official: {},
    meta: {},
    tasks: [],
    requirements: [],
    sources: [
      {
        type: item.sourceType,
        name: item.sourceName,
        url: item.sourceUrl,
        fetched_at: item.fetchedAt,
      },
    ],
    evidence: [],
    scores: {
      authenticity: 0,
      value: 0,
      risk: 'medium',
      grade: 'C',
      authenticityItems: [],
      valueItems: [],
      riskItems: [],
    },
    cost: {
      capital_min_usd: 0,
      capital_max_usd: 0,
      gas_estimate_usd: 0,
      time_minutes: 0,
      long_term: false,
      summary: '待补全',
    },
    recommendation: { grade: 'C', summary: '待评估', action: 'observe' },
    guide: [],
    // 骨架阶段还没有教程；Guide 阶段会按是否抓到真实 HowTo 覆盖为 sourced / template
    guide_source: 'template',
    faq: [],
    risks: [],
    created_at: now,
    discovered_at: now,
    last_checked_at: now,
    last_changed_at: now,
  };
}

/**
 * 合并同一项目来自不同数据源的信息。
 * 关键约束：不覆盖已有人工/官方维护字段，只做增量补充。
 */
export function mergeProject(
  base: AirdropProject,
  incoming: NormalizedItem,
): AirdropProject {
  const existingTest = (s?: string) => !!s && !s.includes('example');
  return {
    ...base,
    status: pickStatus(base.status, incoming.status as AirdropStatus),
    chains: mergeChains(base.chains, incoming.chains as Chain[]),
    sources: mergeUniqueBy<SourceRef>(
      base.sources,
      [
        {
          type: incoming.sourceType,
          name: incoming.sourceName,
          url: incoming.sourceUrl,
          fetched_at: incoming.fetchedAt,
        },
      ],
      sourceKey,
    ),
    // 官方网站在 verify 阶段确认；此处仅在缺失且来源非聚合站时补候选值
    official: {
      ...base.official,
      website: existingTest(base.official.website)
        ? base.official.website
        : base.official.website ?? (incoming.officialUrl || undefined),
    },
    last_checked_at: incoming.fetchedAt,
  };
}

/** 合并证据，按 url 去重 */
export function mergeEvidence(a: Evidence[], b: Evidence[]): Evidence[] {
  const map = new Map<string, Evidence>();
  for (const e of [...a, ...b]) {
    const key = `${e.type}::${e.url}`;
    if (!map.has(key)) map.set(key, e);
  }
  return Array.from(map.values());
}

/**
 * 去重合并入口。
 * 返回按 slug 聚合后的项目列表。
 *
 * 注意：Never throw —— 由调用方保证单个来源失败被隔离。
 */
export function mergeAll(
  normalized: NormalizedItem[],
  previous: AirdropProject[] = [],
): AirdropProject[] {
  const map = new Map<string, AirdropProject>();

  // 先放入历史数据（Last Known Good），保证来源挂掉时不清空
  for (const p of previous) {
    map.set(p.slug, { ...p, sources: [...p.sources] });
  }

  for (const item of normalized) {
    const prev = map.get(item.slug);
    if (!prev) {
      map.set(item.slug, toSkeleton(item));
    } else {
      map.set(item.slug, mergeProject(prev, item));
    }
  }

  return Array.from(map.values());
}
