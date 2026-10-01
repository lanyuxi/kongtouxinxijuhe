/** 活动状态按具体公告核验；来源推断只能作为待核实线索。 */
import type { AirdropProject, AirdropStatus } from '../../src/lib/types';
import { isEvidenceVerified } from '../../src/lib/evidence';

/**
 * 否定句式（必须先于肯定句式判断）。
 *
 * 与 `src/lib/describe.ts` 的 `taglineSaysConfirmed()` 共用同一套规则思路，
 * 但那边的输出只影响文案，这里影响**数据本身**，因此判定必须更严格：
 * 宁可漏升级，也不可错升级。
 */
const NEGATIVE = /has\s+not\s+confirm|claim\s+is\s+not\s+open|未确认|尚未宣布|not\s+(yet\s+)?confirm|no\s+token|hasn'?t\s+confirm|haven'?t\s+confirm|unconfirmed|尚未确认|未有确认|not\s+live|not\s+open/i;

/**
 * 「已结束」信号。
 *
 * ⚠️ 必须排除「分阶段活动」与「后续仍有开放期」的表述
 *   （2026-09-16 独立压测发现的反例，务必保留）：
 *     · `The claim window is closed for phase 1, phase 2 opens next week.`
 *     · `Phase 1 claim has ended, Season 2 is live.`
 *     · `Season 1 claim is closed but Season 2 is open.`
 *   这三句里都出现「closed / ended」，但**活动整体仍然开放**。
 *   把它们判成 `ended` 会把一个正在进行的项目从列表里移除，
 *   比原问题（已结束项目留在列表）严重得多 —— 用户会以为项目消失了。
 *
 *   因此判定分两步：
 *     1. 先看是否明确「整体结束」（`has ended` / `no longer claimable`）；
 *     2. 只看 `closed` 时，要求**不能出现后续期次仍在开放**的表述。
 */
const ENDED_ABSOLUTE =
  /\bhas\s+(now\s+)?ended\b|\bairdrop\s+(has\s+)?ended\b|\bno\s+longer\s+claimable\b|\bairdrop\s+is\s+over\b|已结束|活动已结束/i;

/**
 * 期次级结束：`Phase 1 claim has ended` / `Season 1 has ended`。
 *
 * 与 `ENDED_ABSOLUTE` 分开，因为它**只在没有后续期次开放时才成立**。
 * 实测反例：`Phase 1 claim has ended, Season 2 is live.` ——
 * 整句确实含 `has ended`，但活动整体仍在进行。
 */
const ENDED_PHASE_SCOPED =
  /\b(phase|season|round|stage|epoch)\s*\d*[^.]{0,30}\b(has\s+)?(now\s+)?ended\b/i;
/** 仅 `closed` 类措辞：需要额外排除「后续期次仍开放」 */
const ENDED_SOFT = /\bclaim\s+(window\s+)?(is\s+)?closed\b|\bclaiming\s+(is\s+)?closed\b|领取已关闭/i;
/**
 * 「后续期次仍在开放」信号：一旦命中，`closed` 不再作为整体结束的依据。
 * 覆盖 `phase 2 opens next week` / `Season 2 is live` / `Season 2 is open`
 * 这类「本期关了但还有下一期」的表述。
 */
const LATER_PHASE_OPEN =
  /\b(phase|season|round|stage|epoch)\s*\d*\s*(is\s+)?(now\s+)?(open|live|active|ongoing|opens?|starts?)\b|\bnext\s+(phase|season|round)\b|后续(阶段|期次)|下一(期|阶段)/i;

/**
 * 「已确认」信号。
 *
 * ⚠️ 必须排除假设句与否定结论（2026-09-16 独立压测发现的反例）：
 *   · `If the airdrop is confirmed, we will announce.`  → 假设句，不是事实
 *   · `The airdrop was confirmed to be a scam.`         → 「被确认为骗局」
 *   · `Airdrop is confirmed to have been cancelled.`    → 「被确认已取消」
 *   后两句里 `confirmed` 修饰的是 **坏消息**，若判成「已确认空投」，
 *   等于把「官方说这是骗局」翻成「官方确认有空投」——
 *   这是整个系统里最危险的一类误判。
 */
const CONFIRMED =
  /\bis\s+confirmed\b|\bare\s+confirmed\b|\bhas\s+been\s+confirmed\b|\baidrop\s+is\s+confirmed\b|\bhas\s+airdropped\b|\bairdrop(ed)?\s+(has\s+)?(run|runs|started)\b/i;

/** 「confirmed 之后跟着的是坏消息」——这类句子里的 confirmed 不构成空投确认 */
const CONFIRMED_BAD_NEWS =
  /confirm(ed)?\s+to\s+(be|have\s+been)\s+(a\s+)?(scam|fraud|phishing|fake|rug|cancel\w*|hack\w*|exploit\w*)|confirmed\s+(a\s+)?(scam|fraud|rug)|被确认为(骗局|诈骗)|确认(已)?(取消|终止)/i;

/** 假设 / 将来 / 条件句：出现即不把 confirmed 当作已发生的事实 */
const HYPOTHETICAL =
  /\b(if|once|when|unless|in\s+case)\b[^.]{0,60}\b(confirm\w*|live|open\w*)\b|\bwill\s+be\s+confirm\w*|\bto\s+be\s+confirm\w*|\bwould\s+be\s+confirm\w*|一经确认|若(确认|开放)|确认后将/i;

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

  // 1) 否定优先（`is not confirmed` / `no token` / `unconfirmed` …）
  if (NEGATIVE.test(t)) return null;

  // 2) 假设 / 条件句：`If the airdrop is confirmed…` 不是事实陈述
  if (HYPOTHETICAL.test(t)) return null;

  // 3) `confirmed` 指向坏消息：`was confirmed to be a scam`
  if (CONFIRMED_BAD_NEWS.test(t)) return null;

  // 4) 后续期次仍在开放 → 先判定这一条，避免被期次级 `has ended` 误判。
  //    顺序很关键：`Phase 1 claim has ended, Season 2 is live.` 同时命中
  //    ENDED_ABSOLUTE 与 LATER_PHASE_OPEN，必须让「仍在开放」优先。
  if (LATER_PHASE_OPEN.test(t)) {
    return CLAIM_LIVE.test(t) ? 'claim_live' : null;
  }

  // 5) 整体结束：无条件成立
  if (ENDED_ABSOLUTE.test(t)) return 'ended';

  // 6) 期次级结束 / 仅 `closed` 类措辞：无后续期次即视为整体结束
  if (ENDED_PHASE_SCOPED.test(t) || ENDED_SOFT.test(t)) return 'ended';

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

/** 对账发生在来源描述及人工证据写入之后；较新公告才可解决来源冲突。 */
export function reconcileStatus(p: Pick<AirdropProject, 'status' | 'tagline'> &
  Partial<Pick<AirdropProject, 'tagline_en' | 'sourcedDescription' | 'evidence' | 'sources'>>): StatusReconcileResult {
  const text = `${p.tagline} ${p.tagline_en ?? ''} ${p.sourcedDescription ?? ''}`;
  const inferred = inferStatusFromTagline(text);
  const negative = NEGATIVE.test(text) || CONFIRMED_BAD_NEWS.test(text);
  const announcements = (p.evidence ?? []).filter(e => e.type === 'official_announcement' &&
    isEvidenceVerified(e) && e.activity_status).sort((a, b) =>
      Date.parse(b.verification!.checked_at) - Date.parse(a.verification!.checked_at));
  const latest = announcements[0];
  const checked = Math.max(0, ...(p.sources ?? []).map(s => Date.parse(s.fetched_at) || 0));
  const conflicts = latest && announcements.some(e => Date.parse(e.verification!.checked_at) === Date.parse(latest.verification!.checked_at) &&
    e.activity_status !== latest.activity_status);
  const sourceConflict = latest && (negative || (inferred !== null && inferred !== latest.activity_status));
  let status = p.status;
  let reason: string | undefined;
  if (p.status === 'ended' || inferred === 'ended') {
    status = 'ended';
    reason = inferred === 'ended' ? '来源明确表示活动已结束' : undefined;
  } else if (latest && !conflicts && (!sourceConflict || Date.parse(latest.verification!.checked_at) > checked)) {
    status = latest.activity_status!;
    reason = '活动阶段已按具体官方公告人工核验';
  } else if (p.status === 'confirmed' || p.status === 'claim_live' || p.status === 'pending' ||
    inferred === 'confirmed' || inferred === 'claim_live') {
    status = 'pending';
    reason = sourceConflict || negative || conflicts ? '活动信息相互冲突，尚无较新的明确公告解决冲突' :
      '来源提供了活动线索，但缺少具体官方公告的核验记录';
  }
  return { status, changed: status !== p.status, reason };
}

/** 批量对账，并返回变更清单（便于流水线打印与人工复核） */
export function reconcileAll(
  projects: AirdropProject[],
): { projects: AirdropProject[]; changes: string[] } {
  const changes: string[] = [];
  const out = projects.map((p) => {
    const r = reconcileStatus(p);
    if (r.changed) changes.push(`${p.name}：${p.status} → ${r.status}（${r.reason}）`);
    return { ...p, status: r.status, status_note: r.reason };
  });
  return { projects: out, changes };
}
