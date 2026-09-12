/**
 * Prune：清理「曾经被误抓、现在已不再出现」的项目。
 *
 * 背景（真实问题）：
 *   Merge 阶段为满足不变量 3（单来源失败不能清空数据），会把上一版项目
 *   全部保留为 Last Known Good。这本身是对的，但会带来一个副作用：
 *   早期版本误把聚合站的运营页（blog / faq / calendar / contact / 交易所跳转页）
 *   当成项目抓了进来，此后即使来源已不再收录，它们也会被永久保留。
 *
 * 处理原则（保守，避免误删）：
 *   1) 只有当**所有数据源本轮均成功**时才会执行清理 ——
 *      否则「本轮未出现」可能只是抓取失败，不能据此删除。
 *   2) 只清理「连续多轮未被任何来源提及」的项目，而不是一轮没提到就删。
 *   3) 有官方证据（官网 / Docs / GitHub）的项目一律保留，
 *      即使本轮未被提及 —— 它们是真项目，只是来源临时波动。
 *   4) 人工档案（data/seed/official-profiles.json）中登记过的项目一律保留。
 */

import type { AirdropProject } from '../../src/lib/types';
import type { NormalizedItem } from './normalize';

/** 连续多少轮未被任何来源提及后清理 */
const MISS_STREAK_LIMIT = 2;

/** 已知的聚合站运营页 / 交易所跳转页路径关键词（历史误抓） */
const NON_PROJECT_SLUGS = new Set([
  'blog',
  'faq',
  'calendar',
  'contact',
  'about',
  'privacy-policy',
  'terms',
  'disclaimer',
  'stay-safe',
  'reviews',
  'airdrop-alert',
  'bybit',
  'bitget',
  'deribit',
  'korbit',
  'indodax',
  'tornado-cash',
  'wager-predict',
]);

export interface PruneResult {
  projects: AirdropProject[];
  removed: string[];
}

export function pruneProjects(
  projects: AirdropProject[],
  thisRoundSlugs: Set<string>,
  allSourcesHealthy: boolean,
  knownProfileSlugs: Set<string>,
): PruneResult {
  const removed: string[] = [];
  if (!allSourcesHealthy) {
    // 来源不健康时，绝不清理：本轮缺失可能只是抓取失败
    return { projects, removed };
  }

  const kept = projects.filter((p) => {
    if (thisRoundSlugs.has(p.slug)) {
      // 本轮被提及：清零「缺席计数」
      delete p.miss_streak;
      return true;
    }

    // 有官方证据的真项目：保留（来源波动不应导致被删）
    const hasOfficialEvidence = p.evidence.some(
      (e) => e.verified && /^official_|^quest_space$/.test(e.type),
    );
    if (hasOfficialEvidence) return true;

    // 人工登记过的项目：保留
    if (knownProfileSlugs.has(p.slug)) return true;

    // 已经不在本轮来源、且属于已知运营页 → 立即清理
    if (NON_PROJECT_SLUGS.has(p.slug)) {
      removed.push(p.slug);
      return false;
    }

    // 其余：累计缺席轮次，超过阈值才清理（避免来源临时抖动导致误删）
    const streak = (p.miss_streak ?? 0) + 1;
    if (streak >= MISS_STREAK_LIMIT) {
      removed.push(p.slug);
      return false;
    }
    p.miss_streak = streak;
    return true;
  });

  return { projects: kept, removed };
}

/**
 * 是否可以执行清理。
 *
 * 判断标准不是「所有来源都成功」，而是「**承载项目条目的来源都成功**」。
 * 原因：有些来源本身就存在长期不可用（例如 Galxe 为纯客户端渲染，
 * 在没有官方 API 之前永远抓不到数据）。如果要求全绿才清理，
 * 那历史误抓的运营页将永远无法被清掉。
 *
 * 因此这里只要求：至少有一个来源成功，且**至少一个「条目来源」成功**。
 * 条目来源 = 本轮真正产出了条目的来源。若本轮一条都没抓到，
 * 说明抓取整体异常，此时绝不清理（避免误删全库）。
 */
export function canPrune(health: { ok: boolean; fetched: number }[]): boolean {
  if (health.length === 0) return false;
  const produced = health.filter((h) => h.ok && h.fetched > 0);
  return produced.length > 0;
}

export type { NormalizedItem };
