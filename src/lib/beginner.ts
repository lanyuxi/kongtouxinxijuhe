/**
 * 新手友好度：把「这个项目对小白来不来得及做」变成可筛、可解释的结论。
 *
 * 为什么需要单独一层：
 *   现有筛选里有「成本」，但数据里 `capital_max_usd` 实际只有两三种取值，
 *   分桶后几乎筛不出东西；而小白真正在意的不是「要不要 100 美元」，
 *   而是「我现在、今天、用几分钟、花几毛钱能不能做完」。
 *
 * ⚠ 一个必须说明的取舍（实测踩过的坑）：
 *   最初这里用 `cost.time_minutes <= 15` 作为「耗时短」的判据，
 *   上线前用真实数据一跑，结果**一个项目都筛不出来**。
 *   原因是 141/188 个项目的教程是模板生成的，模板步骤的耗时是固定脚本
 *   （5 + 2 + 2 + 10 + 20 + 3 = 42 分钟），并非真实测得。
 *   用「编造的耗时」去卡用户，等于用假数据做真判断，结论必然失效。
 *   因此判定只依赖**可信的客观字段**：
 *     - 资金门槛（capital_max_usd，来自真实抓取或人工档案）
 *     - Gas 估算（gas_estimate_usd）
 *     - 风险等级（由证据与高危行为推导，与教程是否模板无关）
 *     - 是否有高危行为（needs_signature 等结构信息）
 *   耗时仅作为**展示信息**给出，不参与硬性筛选，避免误伤。
 *
 * 判定条件（全部为「必须同时满足」）：
 *   1. 无需本金：capital_max_usd <= 0
 *   2. 低 Gas：gas_estimate_usd <= 5
 *   3. 风险可控：risk 不为 high / critical
 *   4. 无强制签名步骤：不含 needs_signature，避免小白在不懂签名的前提下操作
 *
 * 这样筛出来的是「今天就能动手、不用担心亏钱」的项目。
 */

import type { AirdropProject } from './types';

/** 新手友好的判定阈值（集中在此，便于调整与单测） */
export const BEGINNER_RULES = {
  /** 允许的最大 Gas 估算（美元） */
  maxGasUsd: 5,
  /** 允许的最大资金门槛（美元）；0 表示不允许任何资金要求 */
  maxCapitalUsd: 0,
} as const;

/** 单个项目的「新手可行」判定明细，用于向用户解释「为什么它（不）适合新手」 */
export interface BeginnerVerdict {
  /** 综合结论：是否新手友好 */
  friendly: boolean;
  /** 免资金（无需投入本金） */
  noCapital: boolean;
  /** 低 Gas */
  lowGas: boolean;
  /** 风险可接受（非 high / critical） */
  safeRisk: boolean;
  /** 无强制签名步骤 */
  noSignature: boolean;
  /** 一句话中文解释，直接展示给用户 */
  reason: string;
  /** 参考耗时（分钟）——仅作展示，不参与筛选 */
  totalMinutes: number;
}

export function beginnerVerdict(p: AirdropProject): BeginnerVerdict {
  const capital = p.cost.capital_max_usd ?? 0;
  const gas = p.cost.gas_estimate_usd ?? 0;
  const totalMinutes =
    p.cost.time_minutes > 0
      ? p.cost.time_minutes
      : p.guide.reduce((sum, g) => sum + (g.minutes || 0), 0);

  const noCapital = capital <= BEGINNER_RULES.maxCapitalUsd;
  const lowGas = gas <= BEGINNER_RULES.maxGasUsd;
  const safeRisk = p.scores.risk !== 'high' && p.scores.risk !== 'critical';
  const noSignature = !p.guide.some((g) => g.needs_signature);

  const friendly = noCapital && lowGas && safeRisk && noSignature;

  const blockers: string[] = [];
  if (!noCapital) blockers.push(`需要准备约 $${capital} 本金`);
  if (!lowGas) blockers.push(`Gas 约 $${gas}，超过新手安全线 $${BEGINNER_RULES.maxGasUsd}`);
  if (!safeRisk) blockers.push('风险等级偏高，不适合新手直接参与');
  if (!noSignature) blockers.push('包含需要签名 / 授权的步骤，新手请先了解签名含义');

  const gasText = gas === 0 ? '几乎不花 Gas' : `Gas 约 $${gas}`;
  const timeText = totalMinutes > 0 ? `，参考耗时约 ${totalMinutes} 分钟` : '';
  const reason = friendly
    ? `无需本金、${gasText}${timeText}，风险可控，适合第一次尝试。`
    : `暂不适合新手：${blockers.join('；')}。`;

  return { friendly, noCapital, lowGas, safeRisk, noSignature, reason, totalMinutes };
}

/** 便捷判定：仅布尔值（筛选用） */
export function isBeginnerFriendly(p: AirdropProject): boolean {
  return beginnerVerdict(p).friendly;
}

/** 统计一批项目里新手友好项数量，用于筛选按钮上的计数提示 */
export function countBeginnerFriendly(projects: AirdropProject[]): number {
  return projects.reduce((n, p) => (isBeginnerFriendly(p) ? n + 1 : n), 0);
}
