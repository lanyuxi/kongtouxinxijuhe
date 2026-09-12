import { useMemo, useState } from 'react';
import type { AirdropProject } from '../lib/types';
import { applyCostBucket, DEFAULT_FILTERS, filterProjects, sortProjects } from '../lib/filter';
import type { Filters } from '../lib/filter';
import { FilterBar } from '../components/FilterBar';
import { ProjectCard } from '../components/ProjectCard';
import { StatBar } from '../components/StatBar';
import type { NavKey } from '../components/Layout';

interface ViewConfig {
  title: string;
  desc: string;
}

const VIEW_CONFIG: Record<NavKey, ViewConfig> = {
  latest: {
    title: '最新空投',
    desc: '发现最近更新的 Web3 空投机会，并快速判断是否值得参与。',
  },
  hot: {
    title: '热门空投',
    desc: '按参与价值、信息完整度综合排序，优先查看更值得研究的项目。',
  },
  potential: {
    title: '潜在空投',
    desc: '尚未正式确认空投，但存在积分、测试网或 Token 计划等明确线索。',
  },
  claim: {
    title: '可领取',
    desc: '已经进入 Claim 阶段的项目，请先核对官方域名再操作。',
  },
  watchlist: {
    title: '我的关注',
    desc: '你收藏的项目与自己的参与进度，数据仅保存在当前浏览器。',
  },
};

export function ListView({
  view,
  projects,
  updatedAt,
  favorites,
  progress,
  onToggleFavorite,
  onClearAll,
}: {
  view: NavKey;
  projects: AirdropProject[];
  updatedAt: string;
  favorites: string[];
  progress: Record<string, { status: string; completed_steps: number[] }>;
  onToggleFavorite: (slug: string) => void;
  onClearAll: () => void;
}) {
  const cfg = VIEW_CONFIG[view];
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
      <div className="flex flex-col gap-5">
        <PageHead cfg={cfg} />
        {saved.length === 0 ? (
          <EmptyState text="你还没有收藏任何项目。在列表页或详情页点击「收藏」即可加入我的关注。" />
        ) : (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              {(['saved', 'preparing', 'doing', 'done'] as const).map((s) => {
                const count = saved.filter((p) => (progress[p.slug]?.status ?? 'saved') === s).length;
                const label = { saved: '已收藏', preparing: '准备参与', doing: '进行中', done: '已完成' }[s];
                return (
                  <span key={s} className="chip border-line bg-white text-ink-soft">
                    {label} <strong className="text-ink">{count}</strong>
                  </span>
                );
              })}
              <button type="button" onClick={onClearAll} className="btn-ghost ml-auto">
                清空本地数据
              </button>
            </div>
            <div className="flex flex-col gap-4">
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
    <div className="flex flex-col gap-5">
      <PageHead cfg={cfg} />
      <StatBar
        projects={projects}
        newToday={newToday}
        updatedAt={updatedAt}
        lastDiscovery={lastDiscovery}
      />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        resultCount={visible.length}
      />
      {visible.length === 0 ? (
        <EmptyState text="没有符合当前筛选条件的项目，试试放宽筛选条件。" />
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((p) => (
            <ProjectCard
              key={p.slug}
              project={p}
              favorited={favorites.includes(p.slug)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
      <CostHint />
    </div>
  );
}

function PageHead({ cfg }: { cfg: ViewConfig }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{cfg.title}</h1>
      <p className="mt-2 text-base text-ink-soft">{cfg.desc}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="card grid place-items-center py-14 text-center">
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  );
}

function CostHint() {
  return (
    <p className="px-1 text-xs text-ink-faint">
      提示：参与价值与真实性为两套独立评分，不存在「总分」。高收益不等于真实，低风险也不等于值得投入。
    </p>
  );
}

export { applyCostBucket };
