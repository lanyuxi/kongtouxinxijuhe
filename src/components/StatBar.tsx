import type { AirdropProject } from '../lib/types';
import { relativeTime, isStale } from '../lib/labels';

/**
 * 首页数据摘要。
 * 排版思路：从「一行文字」改为「四格指标条」——
 * 每个指标有独立标签、数字与辅助说明，宽度等分，视觉上形成节奏。
 */
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

  const stats = [
    { label: '项目总数', value: projects.length, note: `最近发现 ${relativeTime(lastDiscovery)}` },
    { label: '今日新增', value: newToday, note: `数据更新 ${relativeTime(updatedAt)}` },
    { label: '值得关注', value: highValue, note: '价值等级 S / A', tone: 'text-ok' },
    { label: '高风险', value: highRisk, note: '需要谨慎核实', tone: 'text-danger' },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
      <dl className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`px-6 py-5 ${i < 2 ? 'border-b border-line lg:border-b-0' : ''} ${
              i % 2 === 0 ? 'border-r border-line lg:border-r-0' : ''
            }`}
          >
            <dt className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
              {s.label}
            </dt>
            <dd className={`metric mt-2 text-3xl ${s.tone ?? ''}`}>{s.value}</dd>
            <dd className="metric-note mt-1 text-xs">{s.note}</dd>
          </div>
        ))}
      </dl>
      {stale && (
        <p className="border-t border-warn/30 bg-warn-wash px-6 py-3 text-xs font-medium text-warn">
          ⚠ 数据超过 24 小时未更新，信息可能已经变化
        </p>
      )}
    </section>
  );
}
