import { useEffect, useMemo, useRef, useState } from 'react';
import type { ListProject, LiveIndex } from '../lib/types';
import {
  applyCostBucket,
  DEFAULT_FILTERS,
  filterByOverview,
  filterProjects,
  sortProjects,
} from '../lib/filter';
import { OVERVIEW_LABEL } from '../lib/filter';
import type { OverviewKey } from '../lib/filter';
import { flattenGroups, groupByProtocol } from '../lib/describe';
import type { Filters } from '../lib/filter';
import { FilterBar, chainOptions } from '../components/FilterBar';
import { ProjectCard } from '../components/ProjectCard';
import { StatBar } from '../components/StatBar';
import type { NavKey } from '../components/Layout';
import { RefreshBar } from '../components/RefreshBar';
import type { SourceHealthFile } from '../lib/types';
import { SafetyBar } from '../components/Onboarding';
import { TodayTodos } from '../components/TodayTodos';
import { CardSkeletonGrid } from '../components/Skeleton';
import { MetricTile } from '../components/galaxy';
import type { Percentiles } from '../lib/percentile';
import type { ProjectProgress } from '../lib/store';
import { loadFilters, persistFilters, resolveProgress } from '../lib/store';

export function ListView({
  view,
  projects,
  updatedAt,
  favorites,
  progress,
  liveIndex,
  refreshing,
  refreshMessage,
  changeDetails,
  percentiles,
  health,
  onRefresh,
  onToggleFavorite,
  onClearAll,
}: {
  view: NavKey;
  projects: ListProject[];
  updatedAt: string;
  favorites: string[];
  progress: Record<string, ProjectProgress>;
  liveIndex: LiveIndex | null;
  refreshing: boolean;
  refreshMessage: string | null;
  changeDetails?: string[];
  /** 数据源健康状态：供工具条展示「库内 vs 本轮」覆盖率差异（P2-2） */
  health?: SourceHealthFile | null;
  /** 相对分位与参照样本量，用于给卡片补「在本批数据中的相对位置」 */
  percentiles?: Percentiles;
  onRefresh: () => void;
  onToggleFavorite: (slug: string) => void;
  onClearAll: () => void;
}) {
  /**
   * 筛选条件持久化到 LocalStorage（见 lib/store.ts 的 loadFilters）。
   *
   * 为什么用惰性初始化函数而不是 useEffect：
   *   用 useEffect 会导致首帧先渲染默认筛选、再渲染恢复后的筛选 ——
   *   用户会看到列表「闪一下」再变。惰性初始化让首帧就是正确结果。
   */
  const [filters, setFiltersState] = useState<Filters>(() => loadFilters(DEFAULT_FILTERS));
  const setFilters = (next: Filters) => {
    setFiltersState(next);
    persistFilters(next);
  };

  /**
   * 重置筛选时**必须把持久化也一起清掉**，
   * 否则用户「重置」后一刷新又回到旧的筛选条件（比不持久化更困惑）。
   */
  const resetFilters = () => {
    setFiltersState(DEFAULT_FILTERS);
    persistFilters(DEFAULT_FILTERS);
  };
  /**
   * 数据总览口径（点磁贴选中）。
   *
   * 为什么不复用 filters：
   *   总览磁贴是「平台的四个既定口径」，不是用户自由拼条件；
   *   若把它翻译成 status / risk 等字段写进 filters，
   *   既表达不了「今日新增」「S/A 价值」这类组合口径，
   *   又会污染用户在筛选区里的选择（重置筛选时该不该清掉？）。
   *   因此独立成一层，只影响列表展示范围，不写入筛选器。
   */
  const [overview, setOverview] = useState<OverviewKey | null>(null);

  /**
   * 点击磁贴后把列表滚进视野。
   * 磁贴通常已在首屏内，但窄屏下点了「高风险」而结果在屏幕下方时，
   * 用户会以为「点了没反应」。滚动用 smooth + 只滚一次，不劫持用户位置。
   */
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!overview) return;
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [overview]);

  const viewProjects = useMemo(() => {
    switch (view) {
      case 'hot':
        return projects.filter((p) => p.scores.grade === 'S' || p.scores.grade === 'A');
      case 'potential':
        return projects.filter((p) => p.status === 'potential' || p.status === 'new');
      case 'claim':
        return projects.filter((p) => p.status === 'claim_live');
      case 'watchlist':
        return projects.filter((p) => favorites.includes(p.slug));
      default:
        return projects;
    }
  }, [view, projects, favorites]);

  /**
   * 先按总览口径收敛，再交给筛选区与排序。
   * 顺序很关键：总览是「看哪一批」，筛选区是「在这一批里再挑」，
   * 反过来做会让用户以为筛选条件被磁贴重置了。
   */
  const overviewProjects = useMemo(
    () => filterByOverview(viewProjects, overview),
    [viewProjects, overview],
  );

  const visible = useMemo(() => {
    const f = view === 'hot' ? { ...filters, sort: 'value' as const } : filters;
    return sortProjects(filterProjects(overviewProjects, f), f.sort);
  }, [overviewProjects, filters, view]);

  /** 当前生效的总览口径，用于在筛选区里给出一条可移除的条件说明 */
  const overviewLabel = overview ? OVERVIEW_LABEL[overview] : null;

  /**
   * 骨架屏开关。
   *
   * ⚠️ 这里**只在「数据本身还没到位」时**显示骨架屏，不跟随筛选条件。
   *
   * 为什么改（这是一次真实的体验倒退）：
   *   旧实现监听 [projects, filters, view, overview]，
   *   于是用户**每改一次筛选**都会强制闪 180ms 白骨架。
   *   但筛选是纯内存同步计算（`visible` 由 useMemo 一次算出，无 I/O），
   *   数据早就在内存里 —— 本来瞬间就能出结果，却因为「故意等 180ms」
   *   显得比不显示骨架屏还卡。首屏那份 3.8 MB 的下载早已由 App 层的
   *   加载骨架覆盖（见 App.tsx 的 `!dataset` 分支），不该在这里再模拟一次。
   *
   *   保留的判断：只有真的没有项目可渲染时才提示加载中。
   *   刻意不做的事：不在「筛选结果为空」时显示骨架屏 ——
   *   那是真实的空结果，用空态文案说明「放宽筛选条件」才有指导意义。
   */
  const computing = projects.length === 0;

  /**
   * 同协议归组：aave-v3 / aave-v4 / aave-horizon-rwa 共用 aave.com，
   * 直接并列展示会被新手当成 3 个独立空投，重复投入时间。
   * 归组只影响「列表怎么展示」，不删数据：变体各自仍有详情页与 URL。
   *
   * ⚠️ 为什么在筛选/排序之后才归组：
   *    若先归组再筛选，主条目可能被筛掉、留下一个「没有主条目的产品线」，
   *    用户点进去会看到残缺信息。先筛选保证主条目一定在当前结果集内。
   */
  const entries = useMemo(() => flattenGroups(groupByProtocol(visible)), [visible]);

  /**
   * 公链下拉选项：从**当前视图范围**的项目推导，而不是硬编码 9 条。
   * 必须放在任何提前 return 之前，否则 Hooks 调用顺序会随分支变化。
   */
  const chainOpts = useMemo(() => chainOptions(viewProjects), [viewProjects]);

  /** 被折叠为产品线的条目数：让「卡片数 < 项目数」这件事对用户是透明的，而不是看起来像丢数据 */
  const mergedVariants = useMemo(
    () => entries.reduce((n, e) => n + e.variants.length, 0),
    [entries],
  );

  const lastDiscovery = useMemo(
    () =>
      projects.reduce(
        (acc, p) => (p.discovered_at > acc ? p.discovered_at : acc),
        projects[0]?.discovered_at ?? updatedAt,
      ),
    [projects, updatedAt],
  );

  if (view === 'watchlist') {
    const saved = projects.filter((p) => favorites.includes(p.slug));
    return (
      <div className="flex flex-col gap-8">
        {saved.length === 0 ? (
          <EmptyState text="你还没有收藏任何项目。在列表页或详情页点击「收藏」即可加入我的关注。" />
        ) : (
          <>
            {/* 今日待办放在最前面：收藏完就没有下文，是留存最大的断点 */}
            <TodayTodos
              projects={projects}
              favorites={favorites}
              progress={progress}
            />
            {/* 参与漏斗：从「已收藏」到「已完成」是一条推进链路，
                用同一套磁贴表达，用户扫一眼就知道自己卡在哪一步 */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['saved', 'preparing', 'doing', 'done'] as const).map((s) => {
                // 收藏集合是唯一真源：这里不再用 `?? 'saved'` 兜底，
                // 否则「没收藏」会被算成「已收藏」，漏斗四个格子加起来虚高。
                const count = saved.filter(
                  (p) => resolveProgress(p.slug, favorites, progress)?.status === s,
                ).length;
                const meta = {
                  saved: { label: '已收藏', tone: 'brand' as const },
                  preparing: { label: '准备参与', tone: 'warn' as const },
                  doing: { label: '进行中', tone: 'warn' as const },
                  done: { label: '已完成', tone: 'ok' as const },
                }[s];
                return (
                  <MetricTile
                    key={s}
                    label={meta.label}
                    value={count}
                    hint={`占收藏总数 ${saved.length ? Math.round((count / saved.length) * 100) : 0}%`}
                    tone={meta.tone}
                  />
                );
              })}
            </dl>
            <div className="flex flex-wrap gap-4">
              <button type="button" onClick={onClearAll} className="btn-ghost">
                清空本地数据
              </button>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {saved.map((p) => (
                <ProjectCard
                  key={p.slug}
                  project={p}
                  favorited
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {computing && projects.length > 0 && <CardSkeletonGrid rows={1} />}
      <StatBar
        projects={projects}
        updatedAt={updatedAt}
        lastDiscovery={lastDiscovery}
        active={overview}
        onSelect={setOverview}
      />
      {/* 防骗提示常驻：即使看过引导也要长期可见，这是新手最大的损失来源 */}
      <SafetyBar />
      <RefreshBar
        index={liveIndex}
        onRefresh={onRefresh}
        refreshing={refreshing}
        message={refreshMessage}
        changeDetails={changeDetails}
        health={health}
        totalProjects={projects.length}
      />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        chainOptions={chainOpts}
        onReset={resetFilters}
        resultCount={entries.length}
        mergedVariants={mergedVariants}
        activeOverview={overviewLabel}
        onClearOverview={() => setOverview(null)}
      />
      {visible.length === 0 ? (
        <EmptyState
          text={
            overviewLabel
              ? `「${overviewLabel}」在当前筛选条件下没有项目，试试放宽筛选条件，或取消总览口径。`
              : '没有符合当前筛选条件的项目，试试放宽筛选条件。'
          }
        />
      ) : (
        <div
          ref={listRef}
          className="grid scroll-mt-28 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {entries.map((e) => (
            <ProjectCard
              key={e.project.slug}
              project={e.project}
              variants={e.variants}
              variantOf={e.variantOf}
              favorited={favorites.includes(e.project.slug)}
              percentiles={percentiles}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
      <CostHint />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="galaxy-card grid place-items-center gap-4 px-6 py-16 text-center">
      {/* 空态不是错误，但必须比「有内容」更明确地告诉用户下一步做什么。
          因此给一个柔和的环形标记 + 一句可执行的指引，而不是一句「暂无数据」。 */}
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-accent-wash text-2xl text-brand"
      >
        ◌
      </span>
      <p className="max-w-xl text-base leading-relaxed text-ink-soft">{text}</p>
    </div>
  );
}

function CostHint() {
  return (
    <p className="rounded-2xl border border-line-soft bg-white/60 px-5 py-4 text-sm leading-relaxed text-ink-faint">
      提示：参与价值与真实性为两套独立评分，不存在「总分」。高收益不等于真实，低风险也不等于值得投入。
    </p>
  );
}

export { applyCostBucket };
