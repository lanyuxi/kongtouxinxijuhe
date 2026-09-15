import type { AirdropProject } from '../lib/types';
import { relativeTime, isStale } from '../lib/labels';
import { MetricTile } from './galaxy';
import { isHighRisk, isHighValue, utcTodayStart, type OverviewKey } from '../lib/filter';

/**
 * 首页数据摘要。
 * 排版思路：从「一行文字」改为「四格指标条」——
 * 每个指标有独立标签、数字与辅助说明，宽度等分，视觉上形成节奏。
 *
 * 交互补充（本轮）：
 *   四个磁贴从「只读统计」升级为「可点击的口径入口」。
 *   原来的断点很具体：用户看到「值得关注 21」，想知道是哪 21 个，
 *   只能自己滚到筛选区、把「价值等级」重新拼出来——平台明明已经算过了。
 *   现在点磁贴即筛，再点一次取消，中间不做任何确认，符合「看一眼就切」的浏览习惯。
 */
export function StatBar({
  projects,
  updatedAt,
  lastDiscovery,
  active = null,
  onSelect,
}: {
  projects: AirdropProject[];
  updatedAt: string;
  lastDiscovery: string;
  /** 当前生效的总览口径；null = 未按总览筛选 */
  active?: OverviewKey | null;
  /** 点击磁贴。再次点击同一项时传回 null，表示取消该口径 */
  onSelect?: (key: OverviewKey | null) => void;
}) {
  /**
   * 统计口径必须与 lib/filter.ts 的筛选口径共用同一份实现。
   * 否则极易出现「磁贴数字 21、点进去 19 条」，这是最伤信任的一类不一致。
   */
  const todayStart = utcTodayStart();
  const stats: {
    key: OverviewKey;
    label: string;
    value: number;
    note: string;
    tone: 'brand' | 'ok' | 'danger' | 'ink';
  }[] = [
    {
      key: 'total',
      label: '项目总数',
      value: projects.length,
      note: `最近发现 ${relativeTime(lastDiscovery)}`,
      tone: 'brand',
    },
    {
      key: 'newToday',
      label: '今日新增',
      value: projects.filter((p) => new Date(p.discovered_at).getTime() >= todayStart).length,
      note: `数据更新 ${relativeTime(updatedAt)}`,
      tone: 'ink',
    },
    {
      key: 'highValue',
      label: '值得关注',
      value: projects.filter(isHighValue).length,
      note: '价值等级 S / A',
      tone: 'ok',
    },
    {
      key: 'highRisk',
      label: '高风险',
      value: projects.filter(isHighRisk).length,
      note: '需要谨慎核实',
      tone: 'danger',
    },
  ];

  const stale = isStale(updatedAt);
  const interactive = Boolean(onSelect);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="overview-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow" id="overview-title">
          数据总览
        </h2>
        <p className="text-xs text-ink-faint">
          {/* 说明「可点」：不加这句，磁贴上的手型光标在触屏上根本传递不出来 */}
          {interactive ? '点击任一指标，下方列表即按该口径筛选 · ' : ''}
          四项指标口径独立 · 数据 {relativeTime(updatedAt)}更新
        </p>
      </div>
      {/* 指标磁贴：每个数字左侧一道极短色条表明口径，比给整块上色更克制，
          也更适合 4 列并排时的扫描节奏。 */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const selected = active === s.key;
          return (
            <div key={s.key} className="contents">
              <MetricTile
                label={s.label}
                value={s.value}
                hint={s.note}
                tone={s.tone}
                as="button"
                {...(interactive
                  ? {
                      onClick: () => onSelect?.(selected ? null : s.key),
                      'aria-pressed': selected,
                      title: selected
                        ? `取消「${s.label}」筛选`
                        : `只看「${s.label}」的项目`,
                    }
                  : {})}
                className={selected ? 'stat-tile--selected' : ''}
              />
            </div>
          );
        })}
      </dl>
      {stale && (
        <p className="rounded-xl border border-warn/30 bg-warn-wash px-5 py-3 text-xs font-medium text-warn">
          ⚠ 数据超过 24 小时未更新，信息可能已经变化
        </p>
      )}
    </section>
  );
}
