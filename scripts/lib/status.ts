/**
 * 状态对账（P1-1，对应上轮审查 BUG-3）。
 *
 * 背景（实测）：
 *   `status` 由数据源的文字推断而来（`normalizeStatus`），而聚合站的清单页
 *   与详情页文案经常不同步。实测 15 个项目的 tagline 明确写着
 *   `is confirmed` / `is live` / `is open`，`status` 却仍是 `potential`：
 *
 *     infinex      "The Infinex airdrop is confirmed and live."
 *     jupiter      "The Jupiter airdrop is confirmed and has run in phases since January 2024."
 *     push-chain   "The $PC airdrop is confirmed."
 *     …
 *
 *   前端 `src/lib/describe.ts` 里早就写了 `taglineSaysConfirmed()`，
 *   但**它只在文案层对账**（避免简介自相矛盾），status 本身没修 ——
 *   于是出现最糟的组合：
 *     简介说「官方已确认」→ 状态标「潜在空投」→ 筛选器按「潜在」算
 *   三方不一致，用户完全不知道该信哪个。
 *
 * 治理原则（保守，绝不激进改数据）：
 *   1. **只升级不降级**：只在 tagline 给出「更靠后生命周期」的信号时升级。
 *      绝不因为 tagline 没有信号而降级 —— 那会把已确认项目打回潜在，
 *      属于比原问题更严重的破坏。
 *   2. **否定句式优先排除**：`is not confirmed` / `no token` / `unconfirmed`
 *      必须先判否定，否则会把「官方说还没确认」翻成「已确认」，
 *      这是最危险的一类误判（原文说别信，译文说可信）。
 *   3. **可追溯**：返回值带上原因，便于人工复核，不静默改数据。
 */

import type { AirdropProject, AirdropStatus } from '../../src/lib/types';

/** 生命周期排序：只在「更靠后」时升级 */
const STATUS_RANK: Record<AirdropStatus, number> = {
  ended: 5, // ended 单独处理，见 reconcileStatus
  new: 1,
  potential: 2,
  confirmed: 3,
  claim_live: 4,
};

/**
 * 否定句式（必须先于肯定句式判断）。
 *
 * 与 `src/lib/describe.ts` 的 `taglineSaysConfirmed()` 共用同一套规则思路，
 * 但那边的输出只影响文案，这里影响**数据本身**，因此判定必须更严格：
 * 宁可漏升级，也不可错升级。
 */
const NEGATIVE = /not\s+(yet\s+)?confirm|no\s+token|hasn'?t\s+confirm|haven'?t\s+confirm|unconfirmed|尚未确认|未有确认|not\s+live|not\s+open/i;

/** 「已结束」信号 */
const ENDED = /\bhas\s+(now\s+)?ended\b|\bairdrop\s+ended\b|\bclaim\s+(window\s+)?(is\s+)?closed\b|\bno\s+longer\s+claimable\b|已结束|领取已关闭/i;

/** 「已确认」信号 */
const CONFIRMED =
  /\bis\s+confirmed\b|\bare\s+confirmed\b|\bhas\s+been\s+confirmed\b|\baidrop\s+is\s+confirmed\b|\bhas\s+airdropped\b|\bairdrop(ed)?\s+(has\s+)?(run|runs|started)\b/i;

/** 「已开放领取」信号 */
const CLAIM_LIVE = /\bclaim\s+is\s+open\b|\bclaiming\s+(is\s+)?(now\s+)?live\b|\bclaim\s+(now\s+)?live\b|\bclaim\s+has\s+(now\s+)?(opened|started)\b/i;

/**
 * 从 tagline 推断状态。
 *
 * 返回 `null` 表示「tagline 没有给出明确信号」——
 * 此时**不要**去猜，交由调用方保留原有 status。
 */
export function inferStatusFromTagline(tagline: string): AirdropStatus | null {
  const t = (tagline ?? '').trim();
  if (!t) return null;
  // 否定优先：这一条必须在所有肯定规则之前
  if (NEGATIVE.test(t)) return null;
  if (ENDED.test(t)) return 'ended';
  if (CLAIM_LIVE.test(t)) return 'claim_live';
  if (CONFIRMED.test(t)) return 'confirmed';
  return null;
}

export interface StatusReconcileResult {
  status: AirdropStatus;
  /** 是否发生了变更 */
  changed: boolean;
  /** 变更原因（可追溯，供人工复核） */
  reason?: string;
}

/**
 * 用 tagline 的明确信号对账 status。
 *
 * 规则：
 *   - tagline 无信号 → 保持原状
 *   - `ended` 视为最靠后的终态：任何信号都不能把它拉回来
 *   - 其余情况只在「信号更靠后」时升级
 */
export function reconcileStatus(p: Pick<AirdropProject, 'status' | 'tagline'>): StatusReconcileResult {
  const inferred = inferStatusFromTagline(p.tagline);
  if (!inferred) return { status: p.status, changed: false };

  // ended 是终态：一旦结束就不再回到活跃态，即使简介还写着 confirmed
  if (p.status === 'ended') return { status: 'ended', changed: false };
  // 反向：简介说已结束 → 降为 ended。
  // 这是**唯一允许的「降级」**：因为「还在开放领取」与「已结束」
  // 同时展示会造成实质性误导（用户会去点一个已经关闭的入口）。
  if (inferred === 'ended') {
    return {
      status: 'ended',
      changed: true,
      reason: `tagline 明确表示活动已结束（原状态：${p.status}）`,
    };
  }

  if (STATUS_RANK[inferred] > STATUS_RANK[p.status]) {
    return {
      status: inferred,
      changed: true,
      reason: `tagline 明确表示「${
        inferred === 'claim_live' ? '已开放领取' : inferred === 'confirmed' ? '已确认' : inferred
      }」，原状态为 ${p.status}`,
    };
  }
  return { status: p.status, changed: false };
}

/** 批量对账，并返回变更清单（便于流水线打印与人工复核） */
export function reconcileAll(
  projects: AirdropProject[],
): { projects: AirdropProject[]; changes: string[] } {
  const changes: string[] = [];
  const out = projects.map((p) => {
    const r = reconcileStatus(p);
    if (!r.changed) return p;
    changes.push(`${p.name}：${p.status} → ${r.status}（${r.reason}）`);
    return { ...p, status: r.status };
  });
  return { projects: out, changes };
}
