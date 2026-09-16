/**
 * 首次记录时间（P2-1，对应上轮审查 P2-1）。
 *
 * 背景：
 *   `discovered_at` 的语义是「本轮首次进入数据集」，
 *   但前端把它当作「这个空投第一次出现的时间」展示成「今日新增」。
 *   实测 2026-09-16 新增的 13 个项目，其 `sources[].fetched_at` 是 9-12 的 ——
 *   说明它们不是「今天才出现的空投」，而是「今天才第一次进入当前筛选口径」。
 *
 * 修复取向：**不去猜「它在世界上第一次出现的时间」**（我们无从得知，
 * 猜出来就是编造），而是补一个我们**真的知道**的字段：
 *
 *   `first_seen_at` = 该项目在本系统里首次被记录的时间
 *
 * 它的来源优先取 `created_at`（骨架项目创建时写入的时间，
 * 天然就是「我们第一次见到它」），保证历史项目不会被回填成「今天」——
 * 否则「今日新收录 13」会变成「今日新收录 202」，把口径修成了更大的谎。
 */

import type { AirdropProject } from '../../src/lib/types';

/**
 * 幂等地补齐 `first_seen_at`。
 *
 * @param p    项目
 * @param now  当前时间（仅在完全没有历史时间可用时兜底）
 */
export function markFirstSeen(p: AirdropProject, now: Date): AirdropProject {
  if (p.first_seen_at) return p;
  const inherited = p.created_at || p.discovered_at;
  return { ...p, first_seen_at: inherited || now.toISOString() };
}

export function markFirstSeenAll(
  projects: AirdropProject[],
  now: Date,
): { projects: AirdropProject[]; backfilled: number } {
  let backfilled = 0;
  const out = projects.map((p) => {
    if (p.first_seen_at) return p;
    backfilled += 1;
    return markFirstSeen(p, now);
  });
  return { projects: out, backfilled };
}
