import { useEffect, useMemo, useState } from 'react';
import { Header, Footer, Page } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import type { NavKey } from './components/Layout';
import { ListView } from './pages/ListView';
import { DetailView } from './pages/DetailView';
import { SafetyView } from './pages/SafetyView';
import { loadDataset, loadProjectDetail, loadSourceHealth } from './lib/data';
import { loadLiveIndex, runRefresh } from './lib/refresh';
import type { LiveIndex } from './lib/types';
import { useRoute } from './lib/router';
import { resolveProgress, useLocalState } from './lib/store';
import { buildPercentiles } from './lib/percentile';
import type { Percentiles } from './lib/percentile';
import { CardSkeletonGrid, DetailSkeleton } from './components/Skeleton';
import type { AirdropProject, ListDataset, SourceHealthFile } from './lib/types';

export function App() {
  const route = useRoute();
  const { state, toggleFavorite, setProgress, toggleStep, clearAll } = useLocalState();

  const [dataset, setDataset] = useState<ListDataset | null>(null);
  const [health, setHealth] = useState<SourceHealthFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 「一键更新」状态：进度文案 + 来源索引（用于展示数据新鲜度）
  const [liveIndex, setLiveIndex] = useState<LiveIndex | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  // 最近一次抓取的项目级变更明细（人类可读），展示在数据源工具条上
  const [changeDetails, setChangeDetails] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    loadDataset()
      .then((d) => alive && setDataset(d))
      .catch((e) => alive && setError((e as Error).message));
    loadSourceHealth().then((h) => alive && setHealth(h));
    loadLiveIndex().then((i) => alive && setLiveIndex(i));
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 一键更新。
   * 会依次经历：检查数据源 → 触发抓取 → 轮询结果 → 重新加载数据。
   * 每一步的文案都通过 refreshMessage 实时反馈，避免用户面对一个「没有反应的按钮」。
   */
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMessage('正在检查数据源…');
    try {
      const outcome = await runRefresh(liveIndex?.updated_at ?? null, setRefreshMessage);
      if (outcome.dataset) setDataset(outcome.dataset);
      if (outcome.index) setLiveIndex(outcome.index);
      setRefreshMessage(outcome.message);
      setChangeDetails(outcome.details);
      // 数据源健康状态也一并刷新，保证失败提示是最新的
      const h = await loadSourceHealth();
      setHealth(h);
    } catch (e) {
      setRefreshMessage(`更新失败：${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const projects = dataset?.projects ?? [];

  /**
   * 相对分位：一次性对整批项目算好，避免在卡片与详情页里反复排序。
   * 见 lib/percentile.ts —— 绝对分保留不变，只是补一层参照系。
   */
  const percentiles = useMemo<Percentiles>(() => {
    const { authenticity, value } = buildPercentiles(projects);
    return { authenticity, value, total: projects.length };
  }, [projects]);

  /**
   * 详情页项目：**按需加载完整分片**（data/details/<slug>.json）。
   *
   * 为什么不再是 `projects.find(slug)`：
   *   列表数据已瘦身，只含卡片字段；详情页需要的 faq / evidence /
   *   guide.description / scores 明细 / digest 都不在列表里。
   *   因此详情改为进入路由后再单独拉一个约 16 KB 的分片，
   *   首屏因此不必下载完整的 3.87 MB。
   *
   * 三种状态必须区分，否则用户会把「加载中」误读成「项目不存在」：
   *   loading   → 显示详情骨架
   *   notFound  → 显示「未找到该项目」（分片确实不存在）
   *   ready     → 正常渲染
   */
  const [detailProject, setDetailProject] = useState<AirdropProject | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'notFound'>('idle');

  useEffect(() => {
    if (route.kind !== 'detail') {
      setDetailProject(null);
      setDetailState('idle');
      return;
    }
    // 列表里没有这个 slug，说明路由本身是错的，不必再发请求
    if (!projects.some((p) => p.slug === route.slug)) {
      setDetailProject(null);
      setDetailState('notFound');
      return;
    }
    let alive = true;
    setDetailState('loading');
    loadProjectDetail(route.slug).then((full) => {
      if (!alive) return;
      if (!full) {
        setDetailProject(null);
        setDetailState('notFound');
        return;
      }
      // 详情分片本身不带 logo（logo 由 logo-map 在列表加载时贴上），
      // 这里从列表项补一份，避免详情页头部图标丢失。
      const logo = projects.find((p) => p.slug === route.slug)?.logo;
      setDetailProject(logo ? { ...full, logo } : full);
      setDetailState('ready');
    });
    return () => {
      alive = false;
    };
  }, [route, projects]);

  if (error) {
    return (
      <>
        <Header current="latest" />
        <Page>
          <div className="card border-danger/40 bg-danger-wash">
            <p className="text-sm text-danger">数据加载失败：{error}</p>
            <p className="mt-2 text-xs text-ink-soft">
              请确认已执行数据流水线生成 <code>data/airdrops.json</code>。
            </p>
          </div>
        </Page>
      </>
    );
  }

  if (!dataset) {
    return (
      <>
        <Header current="latest" />
        <Page>
          {/* 骨架屏而不是一行文字：首屏只下载列表数据（约 500 KB / gzip 后约 27 KB），
              在此之前给出「结构已就位」的预期，用户不会以为站点坏了。
              详情路由下用详情骨架，避免闪出一块「未找到该项目」的误导提示。 */}
          {route.kind === 'detail' ? <DetailSkeleton /> : <CardSkeletonGrid rows={2} />}
          <p className="mt-4 text-center text-sm text-ink-faint">正在加载空投数据…</p>
        </Page>
      </>
    );
  }

  return (
    <>
      {/* 首访引导：只在第一次访问（或引导版本更新后）出现，可跳过 */}
      <Onboarding />
      <Header current={route.kind === 'list' ? route.view : route.kind === 'safety' ? 'safety' : 'latest'} />
      <main>
        <Page>
          {route.kind === 'safety' ? (
            <SafetyView projects={projects} />
          ) : route.kind === 'detail' ? (
            detailState === 'loading' ? (
              <DetailSkeleton />
            ) : detailProject ? (
              <DetailView
                project={detailProject}
                favorited={state.favorites.includes(detailProject.slug)}
                // 用 resolveProgress 统一解析：未收藏必须是 undefined，
                // 不能让 UI 用 `?? 'saved'` 把「没收藏」显示成「已收藏」。
                progress={resolveProgress(detailProject.slug, state.favorites, state.progress)}
                percentiles={{
                  authenticity: percentiles.authenticity.get(detailProject.slug),
                  value: percentiles.value.get(detailProject.slug),
                  total: percentiles.total,
                }}
                onToggleFavorite={toggleFavorite}
                onSetProgress={setProgress}
                onToggleStep={toggleStep}
                onBack={() => {
                  window.location.hash = '#/latest';
                }}
              />
            ) : (
              <div className="card">
                <p className="text-sm text-ink">未找到该项目。</p>
                <a className="btn-ghost mt-3" href="#/latest">
                  返回最新空投
                </a>
              </div>
            )
          ) : (
            <>
              <SourceHealthBanner health={health} />
              <ListView
                view={route.view as NavKey}
                projects={projects}
                updatedAt={dataset.updated_at}
                favorites={state.favorites}
                progress={state.progress}
                liveIndex={liveIndex}
                refreshing={refreshing}
                refreshMessage={refreshMessage}
                changeDetails={changeDetails}
                percentiles={percentiles}
                health={health}
                onRefresh={handleRefresh}
                onToggleFavorite={toggleFavorite}
                onClearAll={clearAll}
              />
            </>
          )}
        </Page>
      </main>
      <Footer updatedAt={dataset.updated_at} />
    </>
  );
}

/**
 * 数据源健康提示。
 * 对应方案文档第 28 章：单个来源失败时向用户透明说明，但不影响其他数据。
 */
function SourceHealthBanner({ health }: { health: SourceHealthFile | null }) {
  if (!health) return null;
  const failed = health.sources.filter((s) => !s.ok);
  if (failed.length === 0) return null;

  /**
   * 长期不可用的来源与「本次偶发失败」必须分开说，否则会让新手误判数据可信度：
   * Galxe 是纯客户端渲染、官方 API 需登录，属于**已确认无法接入**，
   * 它每轮都会显示「抓取失败」，持续给用户一种「系统坏了」的错觉。
   * 因此这里按「最近一次成功时间」区分：
   *   · 从未 / 超过 24 小时没成功过 → 标记为「暂不支持该来源」（结构性限制）
   *   · 其余 → 正常的「本次失败，已保留上次成功数据」（临时故障）
   */
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const permanent = failed.filter(
    (s) => !s.last_success_at || new Date(s.last_success_at).getTime() < dayAgo,
  );
  const temporary = failed.filter((s) => !permanent.includes(s));

  return (
    <div className="card mb-4 border-warn/40 bg-warn-wash">
      {temporary.length > 0 && (
        <>
          <p className="text-sm text-warn">
            ⚠ 以下数据源本次抓取失败，已保留其上次成功数据：
            {temporary.map((s) => s.name).join('、')}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            失败原因：{temporary.map((s) => `${s.name}（${s.error ?? '未知错误'}）`).join('；')}
          </p>
        </>
      )}
      {permanent.length > 0 && (
        <p className={`text-sm text-ink-soft ${temporary.length > 0 ? 'mt-2' : ''}`}>
          ℹ 暂不支持的数据源：{permanent.map((s) => s.name).join('、')}
          （该来源需要登录态或官方 API，长期无法直接抓取，不计入本次失败）。
          其余来源的数据不受影响。
        </p>
      )}
    </div>
  );
}
