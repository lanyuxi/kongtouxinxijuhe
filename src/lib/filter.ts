/**
 * 首页筛选与排序逻辑。
 * 对应方案文档第 7 章「筛选能力」与第 5 章「空投雷达」。
 */

import type { AirdropProject, AirdropStatus, Chain, RiskLevel } from './types';
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

export function applyCostBucket(p: AirdropProject, bucket: Filters['cost']): boolean {
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
  projects: AirdropProject[],
  f: Filters,
): AirdropProject[] {
  const kw = f.keyword.trim().toLowerCase();
  return projects.filter((p) => {
    if (f.status !== 'all' && p.status !== f.status) return false;
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

export function sortProjects(projects: AirdropProject[], sort: SortKey): AirdropProject[] {
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
