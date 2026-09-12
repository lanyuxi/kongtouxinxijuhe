import type { AirdropProject } from '../lib/types';
import { relativeTime, isStale } from '../lib/labels';

/** 首页一行摘要（不做复杂数据大屏） */
export function StatBar({
  projects,
  newToday,
  updatedAt,
  lastDiscovery,
}: {
  projects: AirdropProject[];
  newToday: number;
  updatedAt: string;
  lastDiscovery: string;
}) {
  const highValue = projects.filter((p) => p.scores.grade === 'S' || p.scores.grade === 'A').length;
  const highRisk = projects.filter(
    (p) => p.scores.risk === 'high' || p.scores.risk === 'critical',
  ).length;

  const stale = isStale(updatedAt);

  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 rounded-2xl border border-line bg-white px-5 py-4 text-sm">
      <span className="text-ink-soft">
        最后更新 <strong className="text-ink">{relativeTime(updatedAt)}</strong>
      </span>
      <span className="text-ink-soft">
        今日新增 <strong className="text-ink">{newToday}</strong>
      </span>
      <span className="text-ink-soft">
        值得关注 <strong className="text-ok">{highValue}</strong>
      </span>
      <span className="text-ink-soft">
        高风险 <strong className="text-danger">{highRisk}</strong>
      </span>
      <span className="ml-auto text-xs text-ink-faint">
        最近发现 {relativeTime(lastDiscovery)}
      </span>
      {stale && (
        <span className="w-full text-xs text-warn">⚠ 数据超过 24 小时未更新，信息可能已经变化</span>
      )}
    </div>
  );
}
