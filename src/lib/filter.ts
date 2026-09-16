/**
 * 首页筛选与排序逻辑。
 * 对应方案文档第 7 章「筛选能力」与第 5 章「空投雷达」。
 */

import type { ListProject, AirdropStatus, Chain, RiskLevel } from './types';
import { isBeginnerFriendly } from './beginner';

export type SortKey = 'latest' | 'value' | 'authenticity' | 'risk' | 'cost';

export interface Filters {
  keyword: string;
  status: AirdropStatus | 'all';
  chain: Chain | 'all';
  category: string | 'all';
  risk: RiskLevel | 'all';
  cost: 'free' | 'lt10' | '10to100' | 'gt100' | 'all';
  /**
   * 新手友好：
   *   - 'all'      不限制
   *   - 'friendly' 只显示「无需本金 + 低 Gas + 15 分钟内 + 风险可控」的项目
   *
   * 这是一个「组合条件」而非单一字段，判定逻辑在 lib/beginner.ts，
   * 因为小白问的不是「多少钱」，而是「我今天几分钟能不能做完」。
   */
  beginner: 'all' | 'friendly';
  sort: SortKey;
}

/**
 * 默认筛选。
 *
 * `status: 'all'` 的含义在 P1-1 里被重新定义：不是「什么都显示」，
 * 而是「显示全部**仍可参与**的状态」—— 已结束的项目默认不出现在列表里。
 *
 * 为什么必须默认排除 `ended`（对应上轮审查 BUG-3）：
 *   `ended` 项目原先与活跃项目并排展示，且计入「今日新增」「值得关注」。
 *   而 RSS（scripts/lib/feed.ts）**早就排除了 ended** ——
 *   同一份数据两套口径，用户在列表看到、在订阅里看不到，无从解释。
 *   一个空投平台的核心承诺是「现在还有什么机会」，
 *   已结束的活动应当是查询对象（可用筛选器主动勾选），而不是默认噪音。
 *   注意：数据本身不删除，用户切到「已结束」仍能看到，信息不丢失。
 */
export const DEFAULT_FILTERS: Filters = {
  keyword: '',
  status: 'all',
  chain: 'all',
  category: 'all',
  risk: 'all',
  cost: 'all',
  beginner: 'all',
  sort: 'latest',
};

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function applyCostBucket(p: ListProject, bucket: Filters['cost']): boolean {
  const max = p.cost.capital_max_usd;
  const gas = p.cost.gas_estimate_usd;
  switch (bucket) {
    case 'free':
      return max === 0 && gas === 0;
    case 'lt10':
      return max > 0 && max < 10;
    case '10to100':
      return max >= 10 && max <= 100;
    case 'gt100':
      return max > 100;
    default:
      return true;
  }
}

export function filterProjects(
  projects: ListProject[],
  f: Filters,
): ListProject[] {
  const kw = f.keyword.trim().toLowerCase();
  return projects.filter((p) => {
    // status === 'all' 表示「全部仍可参与的状态」：默认排除已结束项目，
    // 想看到它们需要显式选择「已结束」。数据不删除，只是不再默认占据列表。
    if (f.status === 'all') {
      if (p.status === 'ended') return false;
    } else if (p.status !== f.status) {
      return false;
    }
    if (f.chain !== 'all' && !p.chains.includes(f.chain)) return false;
    if (f.category !== 'all' && p.category !== f.category) return false;
    if (f.risk !== 'all' && p.scores.risk !== f.risk) return false;
    if (!applyCostBucket(p, f.cost)) return false;
    if (f.beginner === 'friendly' && !isBeginnerFriendly(p)) return false;
    if (kw) {
      const hay = [p.name, p.tagline, p.category, ...p.chains, ...p.tasks]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

export function sortProjects(projects: ListProject[], sort: SortKey): ListProject[] {
  const list = [...projects];
  switch (sort) {
    case 'value':
      return list.sort((a, b) => b.scores.value - a.scores.value);
    case 'authenticity':
      return list.sort((a, b) => b.scores.authenticity - a.scores.authenticity);
    case 'risk':
      return list.sort(
        (a, b) => RISK_ORDER[a.scores.risk] - RISK_ORDER[b.scores.risk],
      );
    case 'cost':
      return list.sort((a, b) => a.cost.capital_max_usd - b.cost.capital_max_usd);
    case 'latest':
    default:
      return list.sort(
        (a, b) =>
          new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime(),
      );
  }
}

export const SORT_LABEL: Record<SortKey, string> = {
  latest: '最新',
  value: '参与价值最高',
  authenticity: '真实性最高',
  risk: '风险最低',
  cost: '成本最低',
};

/**
 * 数据总览磁贴 → 列表筛选。
 * ---------------------------------------------------------------------------
 * 用户看到的四个数字（项目总数 / 今日新收录 / 值得关注 / 高风险）原本只是「统计」，
 * 读完仍然要自己去下面的筛选区里手动还原条件——统计与筛选之间断开了。
 * 这里把四个数字变成可点击的口径入口：点哪个，下面的列表就按哪个口径筛。
 *
 * 为什么单独抽成模块：
 *   1. 口径要与 StatBar 里算数字的口径**完全一致**，否则会出现
 *      「磁贴写着 21，点进去只有 19 条」，用户会认为数据错了；
 *      唯一可靠的做法是两处调用同一份定义。
 *   2. 它是纯函数，可被单元测试直接覆盖，不依赖 DOM。
 */
export type OverviewKey = 'total' | 'newToday' | 'highValue' | 'highRisk';

/**
 * 价值等级 S / A —— 与 StatBar「值得关注」口径一致。
 *
 * ⚠️ 必须排除 `ended`（P1-1，对应上轮审查 BUG-3）：
 *   已结束的项目不该出现在「值得关注」里 —— 「值得关注」的语义是
 *   「现在还值得投入时间」。而原先 `ended` 项目只要价值等级够高
 *   就会被计入，用户点进磁贴后看到的是一批无法再参与的项目。
 *
 * 入参用 `ListProject`：main 侧已把列表数据瘦身为 ListProject
 * （剔除 evidence / 评分明细 / 教程描述，完整数据落到 data/details/）。
 * 本函数只读 status 与 scores.grade/risk，两者都在 ListProject 里，不受影响。
 */
export function isHighValue(p: ListProject): boolean {
  if (p.status === 'ended') return false;
  return p.scores.grade === 'S' || p.scores.grade === 'A';
}

/**
 * 高风险 —— 与 StatBar「高风险」口径一致。
 * 同样排除 `ended`：一个已经结束的活动不存在「现在的风险」。
 */
export function isHighRisk(p: ListProject): boolean {
  if (p.status === 'ended') return false;
  return p.scores.risk === 'high' || p.scores.risk === 'critical';
}

/**
 * 「今日新收录」的今日。
 * 用 UTC 零点而不是本地零点：数据由流水线以 UTC 生成（first_seen_at 也是 UTC），
 * 若按本地时区切分，跨时区用户看到的数字会与 StatBar 的统计错开。
 */
export function utcTodayStart(now: Date = new Date()): number {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
}

/**
 * 是否是「今日新收录」的项目（P2-1，对应上轮审查 P2-1）。
 *
 * 口径修正：原实现用 `discovered_at`（本轮首次进入数据集的时刻），
 * 但那个字段真正表达的是「本轮首次进入当前筛选口径」。
 * 实测 2026-09-16「新增」的 13 个项目，来源抓取时间是 9-12 ——
 * 它们不是「今天出现的空投」。
 *
 * 现在改用 `first_seen_at`（在本系统里首次被记录的时间），
 * 与磁贴文案「今日新收录」严格一致。历史项目不会被回填成今天，
 * 因此这个数字不会因为口径修正而突然变大。
 *
 * ⚠️ `first_seen_at` 必须同时存在于 `ListProject` 里 ——
 *    main 侧的列表瘦身把它漏掉了，这是我合并时补的（见 types.ts 注释）。
 */
export function isNewToday(p: ListProject, now: Date = new Date()): boolean {
  // 已结束的项目不算「今日新收录」：用户看到数字后点进去，
  // 期望是一批可以参与的新机会，而不是刚收录就已经结束的项目。
  if (p.status === 'ended') return false;
  return new Date(p.first_seen_at ?? p.discovered_at).getTime() >= utcTodayStart(now);
}

export const OVERVIEW_LABEL: Record<OverviewKey, string> = {
  total: '项目总数',
  newToday: '今日新收录',
  highValue: '值得关注',
  highRisk: '高风险',
};

/**
 * 按总览口径筛选。
 * 注意：只做「是不是这一类」的判断，不叠加排序；
 * 排序仍由列表自己的 sort 决定，避免点一下磁贴顺带改掉用户的排序设置。
 */
export function filterByOverview(
  projects: ListProject[],
  key: OverviewKey | null,
  now: Date = new Date(),
): ListProject[] {
  if (!key) return projects;
  switch (key) {
    case 'total':
      return projects;
    case 'newToday':
      return projects.filter((p) => isNewToday(p, now));
    case 'highValue':
      return projects.filter(isHighValue);
    case 'highRisk':
      return projects.filter(isHighRisk);
    default:
      return projects;
  }
}
