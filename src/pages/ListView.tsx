import { useMemo, useState } from 'react';
import type { AirdropProject, LiveIndex } from '../lib/types';
import { applyCostBucket, DEFAULT_FILTERS, filterProjects, sortProjects } from '../lib/filter';
import { flattenGroups, groupByProtocol } from '../lib/describe';
import type { Filters } from '../lib/filter';
import { FilterBar } from '../components/FilterBar';
import { ProjectCard } from '../components/ProjectCard';
import { StatBar } from '../components/StatBar';
import type { NavKey } from '../components/Layout';
import { RefreshBar } from '../components/RefreshBar';
import { SafetyBar } from '../components/Onboarding';

export function ListView({
  view,
  projects,
  updatedAt,
  favorites,
  progress,
  liveIndex,
  refreshing,
  refreshMessage,
  onRefresh,
  onToggleFavorite,
  onClearAll,
}: {
  view: NavKey;
  projects: AirdropProject[];
  updatedAt: string;
  favorites: string[];
  progress: Record<string, { status: string; completed_steps: number[] }>;
  liveIndex: LiveIndex | null;
  refreshing: boolean;
  refreshMessage: string | null;
  onRefresh: () => void;
  onToggleFavorite: (slug: string) => void;
  onClearAll: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

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

  const visible = useMemo(() => {
    const f = view === 'hot' ? { ...filters, sort: 'value' as const } : filters;
    return sortProjects(filterProjects(viewProjects, f), f.sort);
  }, [viewProjects, filters, view]);

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

  const newToday = useMemo(() => {
    const start = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    return projects.filter((p) => new Date(p.discovered_at).getTime() >= start).length;
  }, [projects]);

  if (view === 'watchlist') {
    const saved = projects.filter((p) => favorites.includes(p.slug));
    return (
      <div className="flex flex-col gap-8">
        {saved.length === 0 ? (
          <EmptyState text="你还没有收藏任何项目。在列表页或详情页点击「收藏」即可加入我的关注。" />
        ) : (
          <>
            <dl className="grid grid-cols-2 divide-line overflow-hidden rounded-3xl border border-line bg-white shadow-card sm:grid-cols-4 sm:divide-x">
              {(['saved', 'preparing', 'doing', 'done'] as const).map((s, i) => {
                const count = saved.filter((p) => (progress[p.slug]?.status ?? 'saved') === s).length;
                const label = { saved: '已收藏', preparing: '准备参与', doing: '进行中', done: '已完成' }[s];
                return (
                  <div key={s} className={`px-6 py-5 ${i < 2 ? 'border-b border-line sm:border-b-0' : ''} ${i % 2 === 0 ? 'border-r border-line sm:border-r-0' : ''}`}>
                    <dt className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
                      {label}
                    </dt>
                    <dd className="metric mt-2 text-3xl">{count}</dd>
                  </div>
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
      <StatBar
        projects={projects}
        newToday={newToday}
        updatedAt={updatedAt}
        lastDiscovery={lastDiscovery}
      />
      {/* 防骗提示常驻：即使看过引导也要长期可见，这是新手最大的损失来源 */}
      <SafetyBar />
      <RefreshBar
        index={liveIndex}
        onRefresh={onRefresh}
        refreshing={refreshing}
        message={refreshMessage}
      />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        resultCount={entries.length}
        mergedVariants={mergedVariants}
      />
      {visible.length === 0 ? (
        <EmptyState text="没有符合当前筛选条件的项目，试试放宽筛选条件。" />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((e) => (
            <ProjectCard
              key={e.project.slug}
              project={e.project}
              variants={e.variants}
              variantOf={e.variantOf}
              favorited={favorites.includes(e.project.slug)}
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
    <div className="card grid place-items-center gap-3 py-16 text-center">
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-accent-wash text-2xl text-brand"
      >
        ◌
      </span>
      <p className="text-base text-ink-soft">{text}</p>
    </div>
  );
}

function CostHint() {
  return (
    <p className="rounded-2xl border border-line-soft bg-white/60 px-5 py-4 text-sm text-ink-faint">
      提示：参与价值与真实性为两套独立评分，不存在「总分」。高收益不等于真实，低风险也不等于值得投入。
    </p>
  );
}

export { applyCostBucket };
