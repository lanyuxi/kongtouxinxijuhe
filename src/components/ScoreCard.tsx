import type { RiskLevel, ScoreItem } from '../lib/types';
import { AUTH_LEVEL, RISK_LABEL, RISK_REASON } from '../lib/labels';
import { RiskBadge } from './Badge';

/**
 * 评分条：按达成比例着色（达标绿 / 未满橙 / 零分灰）。
 * 高度从 6px 收到 4px、圆角收满 —— 明细列表里会有十几条，
 * 条太粗时视觉噪音会盖过分数本身。
 */
function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line-soft">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${tone}`}
        style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }}
      />
    </div>
  );
}

/** 评分明细：任何评分都必须能解释「为什么得到这个分数」 */
export function ScoreBreakdown({ items }: { items: ScoreItem[] }) {
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((i) => (
        <li key={i.key} className="py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base text-ink">{i.label}</span>
            <span className="metric shrink-0 font-mono text-sm text-ink-soft">
              {i.value}/{i.max}
            </span>
          </div>
          <div className="mt-2">
            <Bar
              value={i.value}
              max={i.max}
              tone={i.value === 0 ? 'bg-line' : i.value >= i.max * 0.7 ? 'bg-ok' : 'bg-warn'}
            />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {i.reason}
            {i.evidenceUrl && (
              <>
                {' '}
                <a
                  className="text-brand underline-offset-2 hover:underline"
                  href={i.evidenceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  查看证据 ↗
                </a>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 三项核心评分并排卡片（不合成总分） */
export function ScoreTrio({
  authenticity,
  value,
  grade,
  risk,
  onExplain,
}: {
  authenticity: number;
  value: number;
  grade: string;
  risk: RiskLevel;
  onExplain?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="card">
        <p className="text-sm text-ink-soft">真实性置信度</p>
        <p className="mt-1.5 metric text-3xl">
          {authenticity}
          <span className="ml-1 text-sm font-normal text-ink-faint">/ 100</span>
        </p>
        <p className="mt-1 text-xs text-ink-soft">{AUTH_LEVEL(authenticity)}</p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-soft">参与价值</p>
        <p className="mt-1.5 metric text-3xl">
          {value}
          <span className="ml-1 text-sm font-normal text-ink-faint">/ 100</span>
        </p>
        <p className="mt-1 text-xs text-ink-soft">等级 {grade}</p>
      </div>
      <div className="card">
        <p className="text-sm text-ink-soft">风险等级</p>
        <p className="mt-1.5">
          <RiskBadge risk={risk} />
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{RISK_REASON[risk]}</p>
      </div>
      {onExplain && (
        <button
          type="button"
          onClick={onExplain}
          className="justify-self-start text-xs text-brand underline-offset-2 hover:underline sm:col-span-3"
        >
          查看评分明细 ↓
        </button>
      )}
      <span className="hidden">{RISK_LABEL[risk]}</span>
    </div>
  );
}
