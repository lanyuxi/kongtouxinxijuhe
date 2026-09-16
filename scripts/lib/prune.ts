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
import { classifyNonAirdrop } from './non-airdrop';

/** 连续多少轮未被任何来源提及后清理 */
const MISS_STREAK_LIMIT = 2;

/**
 * 「来源已停止收录」的最长宽限轮次（P0-1）。
 *
 * 与 MISS_STREAK_LIMIT 的区别：
 *   - MISS_STREAK_LIMIT 适用于「有官方证据的真项目」，来源波动不应删数据；
 *   - 这里适用于**只有第三方来源、且没有任何官方证据**的条目。
 *     它们之所以还在库里，唯一原因是「某来源曾经收录过」。
 *     一旦该来源不再收录，就没有任何理由继续保留 ——
 *     否则历史误抓的运营页 / 交易所条目会永久驻留，这正是 BUG-1 的成因。
 *
 * 为什么仍然给 3 轮宽限而不是立刻删：
 *   来源侧的列表页存在轮换与分页，单轮缺席可能只是排序变化。
 *   3 轮（≈ 定时任务 3 轮）足以区分「偶发缺席」与「真的停收」。
 */
const SOURCE_DROPPED_LIMIT = 3;

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
    const hasHumanProfile = knownProfileSlugs.has(p.slug);
    const hasOfficialEvidence = p.evidence.some(
      (e) => e.verified && /^official_|^quest_space$/.test(e.type),
    );

    // 0) 非空投条目：交易所 / 跨链桥 / 质押衍生品 / 聚合站运营页。
    //    这类条目**无论本轮是否被提及**都不应该出现在空投库里。
    //    为什么放在最前面：它必须能压过「本轮被提及」这条豁免 ——
    //    DefiLlama 每轮都会继续返回 Binance CEX，只要按「本轮出现即保留」
    //    处理，它就永远清不掉（这正是 BUG-1 顽固了数天的原因）。
    const verdict = classifyNonAirdrop({
      name: p.name,
      categoryText: p.sources.some((s) => s.name === 'DefiLlama') ? p.category : undefined,
    });
    if (verdict.excluded && !hasHumanProfile) {
      removed.push(p.slug);
      return false;
    }

    if (thisRoundSlugs.has(p.slug)) {
      // 本轮被提及：清零「缺席计数」
      delete p.miss_streak;
      return true;
    }

    // 有官方证据的真项目：保留（来源波动不应导致被删）
    if (hasOfficialEvidence) return true;

    // 人工登记过的项目：保留
    if (hasHumanProfile) return true;

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

    // 边界情况：只有第三方来源、且没有任何官方证据的条目。
    // 它们没有「官方证据」这个免死金牌，宽限期应显著更短 ——
    // 否则只要曾经被某个来源收录过，就会无限期驻留。
    const onlyThirdParty = !hasOfficialEvidence;
    if (onlyThirdParty && streak >= SOURCE_DROPPED_LIMIT) {
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
 *
 * ⚠️ P0-1 复核：旧实现是「只要**有一个** ok 且 fetched>0 就放行」，
 *    于是「Airdrops 成功 + DefiLlama 挂掉」这种常见故障下依旧返回 true。
 *    此时 prune 会按「本轮未出现」把 DefiLlama 独有的大量真项目
 *    当成失效条目连删两轮 —— 一次来源抖动就能清掉上百条真实数据。
 *
 *    收紧后的判定：
 *      1. 成功产出的来源必须**不少于失败来源**（简单多数），
 *         避免「一个成功 + 三个失败」仍然照删；
 *      2. 成功产出的条目数必须达到总抓取量的 **60%**，
 *         多来源同时半死（各自只返回个位数）时不动库。
 *    这两条都只针对「要不要删」，不影响正常写入 ——
 *    拿不准就不删，永远比误删安全。
 */
export function canPrune(health: { ok: boolean; fetched: number }[]): boolean {
  if (health.length === 0) return false;
  const produced = health.filter((h) => h.ok && h.fetched > 0);
  if (produced.length === 0) return false;
  // 1) 成功来源不少于失败来源
  if (produced.length * 2 < health.length) return false;
  // 2) 成功来源抓到的条目占比 >= 60%
  const totalFetched = health.reduce((s, h) => s + Math.max(0, h.fetched), 0);
  const okFetched = produced.reduce((s, h) => s + h.fetched, 0);
  if (totalFetched > 0 && okFetched / totalFetched < 0.6) return false;
  return true;
}

export type { NormalizedItem };
