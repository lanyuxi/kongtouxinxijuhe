/** 新手筛选只能使用已知费用与明确的签名要求，未知不会被当作零。 */
import type { ListProject } from './types';
import { hasKnownCost } from './cost';

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

export function beginnerVerdict(p: ListProject): BeginnerVerdict {
  const capital = p.cost.capital_max_usd;
  const gas = p.cost.gas_estimate_usd;
  const totalMinutes =
    p.cost.time_minutes > 0
      ? p.cost.time_minutes
      : p.guide.reduce((sum, g) => sum + (g.minutes || 0), 0);

  const known = hasKnownCost(p.cost);
  const noCapital = known && capital! <= BEGINNER_RULES.maxCapitalUsd;
  const lowGas = known && gas! <= BEGINNER_RULES.maxGasUsd;
  const safeRisk = p.scores.risk !== 'high' && p.scores.risk !== 'critical' && p.guide.every(g => g.risk !== 'unknown');
  const noSignature = p.guide.length > 0 && p.guide.every(g => g.needs_signature === false);

  const friendly = noCapital && lowGas && safeRisk && noSignature && p.status !== 'pending' && p.status !== 'ended';

  const blockers: string[] = [];
  if (!known) blockers.push('本金或手续费尚未核实');
  if (p.status === 'pending') blockers.push('活动状态待核实');
  if (p.status === 'ended') blockers.push('活动已结束');
  if (known && !noCapital) blockers.push(`需要准备约 $${capital} 本金`);
  if (known && !lowGas) blockers.push(`Gas 约 $${gas}，超过新手安全线 $${BEGINNER_RULES.maxGasUsd}`);
  if (!safeRisk) blockers.push('风险偏高或步骤风险尚未核实');
  if (!noSignature) blockers.push('包含签名 / 授权，或签名要求尚未核实');

  const gasText = gas === 0 ? '无需手续费' : `Gas 约 $${gas}`;
  const timeText = totalMinutes > 0 ? `，参考耗时约 ${totalMinutes} 分钟` : '';
  const reason = friendly
    ? `无需本金、${gasText}${timeText}，风险可控，适合第一次尝试。`
    : `暂不适合新手：${blockers.join('；')}。`;

  return { friendly, noCapital, lowGas, safeRisk, noSignature, reason, totalMinutes };
}

/** 便捷判定：仅布尔值（筛选用） */
export function isBeginnerFriendly(p: ListProject): boolean {
  return beginnerVerdict(p).friendly;
}

/** 统计一批项目里新手友好项数量，用于筛选按钮上的计数提示 */
export function countBeginnerFriendly(projects: ListProject[]): number {
  return projects.reduce((n, p) => (isBeginnerFriendly(p) ? n + 1 : n), 0);
}
