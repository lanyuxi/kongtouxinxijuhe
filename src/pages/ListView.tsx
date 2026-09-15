import { useEffect, useMemo, useRef, useState } from 'react';
import type { AirdropProject, LiveIndex } from '../lib/types';
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
import { FilterBar } from '../components/FilterBar';
import { ProjectCard } from '../components/ProjectCard';
import { StatBar } from '../components/StatBar';
import type { NavKey } from '../components/Layout';
import { RefreshBar } from '../components/RefreshBar';
import { SafetyBar } from '../components/Onboarding';
import { TodayTodos } from '../components/TodayTodos';
import { CardSkeletonGrid } from '../components/Skeleton';
import { MetricTile } from '../components/galaxy';
import type { Percentiles } from '../lib/percentile';
import type { ProjectProgress } from '../lib/store';

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
  onRefresh,
  onToggleFavorite,
  onClearAll,
}: {
  view: NavKey;
  projects: AirdropProject[];
  updatedAt: string;
  favorites: string[];
  progress: Record<string, ProjectProgress>;
  liveIndex: LiveIndex | null;
  refreshing: boolean;
  refreshMessage: string | null;
  changeDetails?: string[];
  /** 相对分位与参照样本量，用于给卡片补「在本批数据中的相对位置」 */
  percentiles?: Percentiles;
  onRefresh: () => void;
  onToggleFavorite: (slug: string) => void;
  onClearAll: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
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
   * 触发条件：筛选项变了、数据变了，但这一帧还没算出结果。
   * 为什么需要它：真实数据集首屏要下载 3.8 MB 的 airdrops.json（188 个项目），
   * 在此期间页面只有一行「正在加载空投数据…」，用户会以为站点坏了。
   * 骨架屏给出「结构已就位、内容马上来」的预期，感知等待时间显著更短。
   *
   * 刻意不做的事：不在「筛选结果为空」时显示骨架屏 ——
   * 那是真实的空结果，用空态文案说明「放宽筛选条件」才有指导意义。
   */
  const [computing, setComputing] = useState(false);
  useEffect(() => {
    if (projects.length === 0) return;
    setComputing(true);
    const t = setTimeout(() => setComputing(false), 180);
    return () => clearTimeout(t);
  }, [projects, filters, view, overview]);

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
                const count = saved.filter((p) => (progress[p.slug]?.status ?? 'saved') === s).length;
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
      />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
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
