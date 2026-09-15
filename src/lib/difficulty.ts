/**
 * 操作难度（1–5 星）。
 *
 * 为什么必须单独一层（第一性原理：难度要能被用户用来做决策）：
 *   旧实现是 `round(cost.time_minutes / 20)`，而 `time_minutes` 是**模板教程的固定脚本**
 *   （5+2+2+10+20+3 = 42 分钟），并不是真实测得的耗时。
 *   实测难度分布只有 1 星 41 个、2 星 148 个 —— 5 星制只用到 2 档，
 *   等于没有难度这一信息。这与 `lib/beginner.ts` 已经踩过并修正的坑是同一个：
 *   **不能用编造的耗时做真判断**。
 *
 *   因此改用**可信的结构化字段**组合计算，全部来自数据本身而非估算：
 *     · 步骤数（guide.length，真实抓取或模板的结构信息）
 *     · 是否需要签名 / 授权（needs_signature）
 *     · 是否需要本金（capital_max_usd > 0）
 *     · 是否涉及跨链（跨链是新手最容易出错的环节）
 *     · 风险等级（高风险项目的操作容错更低）
 *
 * 边界：只在 1–5 之间取值，且**每个分档都要有项目落在里面**（有单测锁定）。
 */

import type { ListProject } from './types';

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: '很简单',
  2: '较简单',
  3: '中等',
  4: '偏难',
  5: '很难',
};

/**
 * 计算操作难度。
 *
 * 权重理由：
 *   本金 与 签名/授权 是「真金白银」的门槛，权重最高（各 +1，本金额外 +0.5）；
 *   步骤数每多 3 步加一档，反映操作链条长度；
 *   跨链 +1（新手最常见的踩坑点）；
 *   高风险 +0.5（容错空间小，实际执行更难）。
 */
export function difficultyOf(p: ListProject): number {
  const steps = p.guide?.length ?? 0;
  const needsSignature = (p.guide ?? []).some((s) => s.needs_signature);
  const needsCapital = (p.cost?.capital_max_usd ?? 0) > 0;
  const crossChain = (p.tasks ?? []).some((t) => /跨链|bridge|跨链转移/i.test(t));
  const risky = p.scores?.risk === 'high' || p.scores?.risk === 'critical';

  // 基础：步骤数决定起跑线（4 步及以下算常规）
  let score = 1;
  if (steps >= 10) score += 2;
  else if (steps >= 7) score += 1.5;
  else if (steps >= 6) score += 0.5;

  if (needsSignature) score += 1;
  if (needsCapital) score += 1.5;
  if (crossChain) score += 1;
  if (risky) score += 0.5;

  return Math.max(1, Math.min(5, Math.round(score)));
}
