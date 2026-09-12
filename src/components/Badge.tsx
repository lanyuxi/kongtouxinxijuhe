import type { ReactNode } from 'react';
import type { AirdropStatus, RiskLevel } from '../lib/types';
import { STATUS_LABEL, STATUS_STYLE, RISK_LABEL, RISK_STYLE } from '../lib/labels';

/** 状态点：用小圆点强化状态语义，比纯文字块更易扫读 */
function Dot({ tone }: { tone: string }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden />;
}

const STATUS_DOT: Record<AirdropStatus, string> = {
  new: 'bg-brand',
  potential: 'bg-ink-faint',
  confirmed: 'bg-ok',
  claim_live: 'bg-warn',
  ended: 'bg-ink-faint',
};

export function StatusBadge({ status }: { status: AirdropStatus }) {
  return (
    <span className={`chip ${STATUS_STYLE[status]}`}>
      <Dot tone={STATUS_DOT[status]} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * 风险徽章。
 * 「高 / 极高」用实心块强调，其余用浅底 —— 让危险等级在列表里能被一眼捕捉。
 */
export function RiskBadge({
  risk,
  withLabel = false,
}: {
  risk: RiskLevel;
  withLabel?: boolean;
}) {
  const critical = risk === 'critical';
  return (
    <span className={`chip ${RISK_STYLE[risk]} ${critical ? 'shadow-sm' : ''}`}>
      {!critical && <Dot tone={RISK_DOT[risk]} />}
      {withLabel ? '风险 ' : ''}
      {RISK_LABEL[risk]}
    </span>
  );
}

const RISK_DOT: Record<RiskLevel, string> = {
  low: 'bg-ok',
  medium: 'bg-warn',
  high: 'bg-danger',
  critical: 'bg-white',
};

export function CategoryBadge({ label }: { label: string }) {
  return <span className="chip border-line bg-white text-ink-soft">{label}</span>;
}

/** 中性信息标签：用于公链、类型等不带状态的元数据 */
export function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line-soft bg-page px-3 py-1 text-xs font-medium text-ink-soft">
      {children}
    </span>
  );
}
