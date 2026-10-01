import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { LocalBackup } from '../components/LocalBackup';
import { XUpdates } from '../components/XUpdates';
import type { XResult } from '../lib/x-api-types';
import { readListContext, saveListContext } from '../lib/router';
import { MetricTile } from '../components/galaxy';
import type { Percentiles } from '../lib/percentile';
import type { LocalState, ProjectProgress } from '../lib/store';
import { loadFilters, persistFilters, resolveProgress } from '../lib/store';
import { isStale, refreshCapability, refreshEndpoint } from '../lib/refresh';

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
  localState,
  onImportBackup,
  xResult,
  onXRefresh,
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
  localState?: LocalState;
  onImportBackup?: (text: string) => number;
  xResult?: XResult;
  onXRefresh?: () => void;
}) {
  /**
   * 筛选条件持久化到 LocalStorage（见 lib/store.ts 的 loadFilters）。
   *
   * 为什么用惰性初始化函数而不是 useEffect：
   *   用 useEffect 会导致首帧先渲染默认筛选、再渲染恢复后的筛选 ——
   *   用户会看到列表「闪一下」再变。惰性初始化让首帧就是正确结果。
   */
  const [filters, setFiltersState] = useState<Filters>(() => readListContext(view)?.filters ?? loadFilters(DEFAULT_FILTERS));
  const setFilters = (next: Filters) => {
    setFiltersState(next);
    persistFilters(next);
  };

  /**
   * 重置筛选时**必须把持久化也一起清掉**，
   * 否则用户「重置」后一刷新又回到旧的筛选条件（比不持久化更困惑）。
   */
  const resetFilters = () => {
    setOverview(null);
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
  const [overview, setOverview] = useState<OverviewKey | null>(() => readListContext(view)?.overview ?? null);

  const [expanded, setExpanded] = useState(() => readListContext(view)?.expanded ?? false);
  const [sourceExpanded, setSourceExpanded] = useState(() => readListContext(view)?.sourceExpanded ?? false);
  const [statsExpanded, setStatsExpanded] = useState(() => readListContext(view)?.statsExpanded ?? false);
  const contextRef = useRef({ filters, overview, expanded, sourceExpanded, statsExpanded, scrollY: readListContext(view)?.scrollY ?? 0 });
  contextRef.current = { ...contextRef.current, filters, overview, expanded, sourceExpanded, statsExpanded };
  useLayoutEffect(() => {
    window.scrollTo({ top: contextRef.current.scrollY, behavior: 'instant' });
    const remember = () => { contextRef.current.scrollY = window.scrollY; };
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      saveListContext(view, contextRef.current);
      window.removeEventListener('scroll', remember);
    };
  }, [view]);

  /**
   * 点击磁贴后把列表滚进视野。
   * 磁贴通常已在首屏内，但窄屏下点了「高风险」而结果在屏幕下方时，
   * 用户会以为「点了没反应」。滚动用 smooth + 只滚一次，不劫持用户位置。
   */
  const listRef = useRef<HTMLDivElement>(null);
  const previousOverview = useRef(overview);
  useEffect(() => {
    if (previousOverview.current === overview) return;
    previousOverview.current = overview;
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
      <div className="flex flex-col gap-5">
        {xResult && <XUpdates result={xResult} onRefresh={onXRefresh} />}
        {localState && onImportBackup && <LocalBackup state={localState} onImport={onImportBackup} onClear={onClearAll} unavailable={favorites.length - saved.length} />}
        {Object.values(progress).some(p => p?.needs_review) && <p role="status" className="rounded-xl border border-warn/30 bg-warn-wash p-4 text-sm text-warn">部分教程已变化，相关完成记录需要复核。请打开项目详情核对新步骤。</p>}
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {saved.map((p) => (
                <ProjectCard
                  key={p.slug}
                  project={p}
                  favorited
                  onToggleFavorite={onToggleFavorite}
                  xResult={xResult}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const refreshCap = refreshCapability(refreshEndpoint());

  return (
    <div className="flex flex-col gap-4">
      {computing && projects.length > 0 && <CardSkeletonGrid rows={1} />}
      {xResult && <XUpdates result={xResult} onRefresh={onXRefresh} />}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">{view === 'hot' ? '热门精选' : view === 'claim' ? '可领取项目' : view === 'potential' ? '潜在机会' : '发现空投项目'}</h1>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
          aria-describedby={refreshMessage ? 'refresh-status-text' : undefined}
          title={refreshCap.note}
          className={`btn-primary shrink-0 !px-6 !py-3 disabled:cursor-not-allowed disabled:opacity-60 ${isStale(liveIndex) ? 'animate-pulse-soft' : ''}`}
        >
          {refreshing ? <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />刷新中…</> : <>⟳ {refreshCap.buttonLabel}</>}
        </button>
      </div>
      {refreshMessage && <p id="refresh-status-text" className="text-sm font-medium text-brand" role="status" aria-live="polite">{refreshing ? '⏳ ' : '✓ '}{refreshMessage}</p>}
      <FilterBar
        expanded={expanded}
        onExpandedChange={setExpanded}
        filters={filters}
        onChange={setFilters}
        chainOptions={chainOpts}
        onReset={resetFilters}
        resultCount={entries.length}
        mergedVariants={mergedVariants}
        activeOverview={overviewLabel}
        onClearOverview={() => setOverview(null)}
      />
      <details open={sourceExpanded} onToggle={e => setSourceExpanded(e.currentTarget.open)} className="rounded-xl border border-line bg-white px-4 py-3">
        <summary className="text-sm text-ink-soft">公共来源检查与更新{health && ` · ${health.sources.filter(s => !s.ok && s.status !== 'not_configured').length} 个来源抓取异常`}</summary>
        {health && health.sources.some(s => !s.ok) && <div className="mt-3 text-sm text-ink-soft">
          {health.sources.filter(s => !s.ok).map(s => <p key={s.name}>{s.status === 'not_configured' ? '尚未配置' : '抓取失败，保留上次数据'}：{s.name}{s.error && `（${s.error}）`}</p>)}
          <p className="mt-2 text-xs text-ink-faint">以上为公共来源的检查记录，不代表你的个人 X API 检测结果。<a href="#/settings" className="text-brand underline">配置或检测我的 X API</a></p>
        </div>}
        <div className="mt-4"><RefreshBar index={liveIndex} changeDetails={changeDetails} health={health} totalProjects={projects.length} /></div>
      </details>
      {visible.length === 0 ? (
        <EmptyState
          text={
            view === 'hot' && viewProjects.length === 0
              ? '尚无达到热门精选标准的项目。请查看最新项目并核对来源；不会降低证据标准来填充此页。'
              : view === 'claim' && viewProjects.length === 0
                ? '目前没有已核验且正在领取的活动。可先查看最新项目。'
              : overviewLabel
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
              xResult={xResult}
            />
          ))}
        </div>
      )}
      <details open={statsExpanded} onToggle={e => setStatsExpanded(e.currentTarget.open)} className="rounded-xl border border-line bg-white p-4">
        <summary className="font-medium text-ink-soft">数据总览与安全提示</summary>
        <div className="mt-4 flex flex-col gap-4">
          <StatBar projects={projects} updatedAt={updatedAt} lastDiscovery={lastDiscovery} active={overview} onSelect={setOverview} />
          <SafetyBar />
        </div>
      </details>
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
