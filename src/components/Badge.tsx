import type { AirdropStatus, RiskLevel } from '../lib/types';
import { STATUS_LABEL, STATUS_STYLE, RISK_LABEL, RISK_STYLE } from '../lib/labels';

export function StatusBadge({ status }: { status: AirdropStatus }) {
  return <span className={`chip ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function RiskBadge({
  risk,
  withLabel = false,
}: {
  risk: RiskLevel;
  withLabel?: boolean;
}) {
  return (
    <span className={`chip ${RISK_STYLE[risk]}`}>
      {withLabel ? '风险 ' : ''}
      {RISK_LABEL[risk]}
    </span>
  );
}

export function CategoryBadge({ label }: { label: string }) {
  return <span className="chip border-line bg-white text-ink-soft">{label}</span>;
}
