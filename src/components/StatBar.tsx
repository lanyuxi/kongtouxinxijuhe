import type { AirdropProject } from '../lib/types';
import { relativeTime, isStale } from '../lib/labels';
import { MetricTile } from './galaxy';

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

  /**
   * 四个指标的口径必须与颜色一致：
   *   蓝 = 规模（有多少）
   *   绿 = 机会（值得投入）
   *   红 = 风险（需要回避）
   * 颜色一旦只做装饰，用户就必须读文字才能判断语义，指标条也就白做了。
   */
  const stats: {
    label: string;
    value: number;
    note: string;
    tone: 'brand' | 'ok' | 'danger' | 'ink';
  }[] = [
    {
      label: '项目总数',
      value: projects.length,
      note: `最近发现 ${relativeTime(lastDiscovery)}`,
      tone: 'brand',
    },
    { label: '今日新增', value: newToday, note: `数据更新 ${relativeTime(updatedAt)}`, tone: 'ink' },
    { label: '值得关注', value: highValue, note: '价值等级 S / A', tone: 'ok' },
    { label: '高风险', value: highRisk, note: '需要谨慎核实', tone: 'danger' },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">数据总览</h2>
        <p className="text-xs text-ink-faint">
          四项指标口径独立 · 数据 {relativeTime(updatedAt)}更新
        </p>
      </div>
      {/* 指标磁贴：每个数字左侧一道极短色条表明口径，比给整块上色更克制，
          也更适合 4 列并排时的扫描节奏。 */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <MetricTile
            key={s.label}
            label={s.label}
            value={s.value}
            hint={s.note}
            tone={s.tone}
          />
        ))}
      </dl>
      {stale && (
        <p className="rounded-xl border border-warn/30 bg-warn-wash px-5 py-3 text-xs font-medium text-warn">
          ⚠ 数据超过 24 小时未更新，信息可能已经变化
        </p>
      )}
    </section>
  );
}
