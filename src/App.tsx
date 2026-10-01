import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Header, Footer, Page } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import type { NavKey } from './components/Layout';
import { ListView } from './pages/ListView';
import { DetailView } from './pages/DetailView';
import { SafetyView } from './pages/SafetyView';
import { SettingsView } from './pages/SettingsView';
import { useXSettings } from './lib/use-x-settings';
import { DataLoadError, loadDataset, loadProjectDetail, loadSourceHealth } from './lib/data';
import { loadLiveIndex, runRefresh } from './lib/refresh';
import type { LiveIndex } from './lib/types';
import { detailReturnTarget, parseHash, returnToList, useRoute } from './lib/router';
import { resolveGuideProgress, resolveProgress, useLocalState } from './lib/store';
import { buildPercentiles } from './lib/percentile';
import type { Percentiles } from './lib/percentile';
import { CardSkeletonGrid, DetailSkeleton } from './components/Skeleton';
import type { AirdropProject, ListDataset, SourceHealthFile } from './lib/types';

export function App() {
  const route = useRoute();
  const { state, toggleFavorite, setProgress, toggleStep, clearAll, importBackup, reconcileGuides, reviewGuide } = useLocalState();

  const [dataset, setDataset] = useState<ListDataset | null>(null);
  const [health, setHealth] = useState<SourceHealthFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryDataset, setRetryDataset] = useState(0);
  const personalX = useXSettings(async () => {
    const fresh = await loadDataset(); setDataset(fresh);
    setHealth(await loadSourceHealth()); setLiveIndex(await loadLiveIndex());
  });

  // 「一键更新」状态：进度文案 + 来源索引（用于展示数据新鲜度）
  const [liveIndex, setLiveIndex] = useState<LiveIndex | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  // 最近一次抓取的项目级变更明细（人类可读），展示在数据源工具条上
  const [changeDetails, setChangeDetails] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setError(null);
    loadDataset()
      .then((d) => alive && setDataset(d))
      .catch((e) => alive && setError((e as Error).message));
    loadSourceHealth().then((h) => alive && setHealth(h));
    loadLiveIndex().then((i) => alive && setLiveIndex(i));
    return () => {
      alive = false;
    };
  }, [retryDataset]);

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
  useEffect(() => { if (dataset) reconcileGuides(dataset.projects); }, [dataset, state.favorites, reconcileGuides]);
  useLayoutEffect(() => { if (route.kind !== 'list') window.scrollTo({ top: 0, behavior: 'auto' }); }, [route]);

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
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'notFound' | 'error'>('idle');
  const [detailError, setDetailError] = useState('');
  const [retryDetail, setRetryDetail] = useState(0);

  useEffect(() => {
    if (route.kind !== 'detail') {
      setDetailProject(null);
      setDetailState('idle');
      return;
    }
    if (!dataset) return;
    setDetailError('');
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
      // 详情分片本身不带 logo（logo 由 logo-map 在列表加载时贴上），
      // 这里从列表项补一份，避免详情页头部图标丢失。
      const logo = projects.find((p) => p.slug === route.slug)?.logo;
      setDetailProject(logo ? { ...full, logo } : full);
      setDetailState('ready');
    }).catch(e => {
      if (!alive) return;
      setDetailProject(null);
      setDetailError(e instanceof DataLoadError ? e.message : '项目资料暂时无法加载，请重试。');
      setDetailState(e instanceof DataLoadError && e.kind === 'not_found' ? 'notFound' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [route, projects, dataset, retryDetail]);

  if (route.kind === 'settings') {
    return <><Header current="settings" /><main><Page><SettingsView x={personalX} /></Page></main><Footer updatedAt={dataset?.updated_at} /></>;
  }

  if (error) {
    return (
      <>
        <Header current="latest" />
        <Page>
          <div className="card border-danger/40 bg-danger-wash">
            <h1 className="text-lg font-semibold">项目列表暂时无法加载</h1>
            <p className="mt-2 text-sm text-danger">{error}</p>
            <button className="btn-primary mt-4" onClick={() => setRetryDataset(n => n + 1)}>重新加载列表</button>
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
      <Header current={route.kind === 'list' ? route.view : route.kind === 'safety' ? 'safety' : (parseHash(detailReturnTarget()) as { view: NavKey }).view} />
      <main>
        <Page>
          {route.kind === 'safety' ? (
            <SafetyView projects={projects} />
          ) : route.kind === 'detail' ? (
            detailState === 'loading' || detailState === 'idle' ? (
              <DetailSkeleton />
            ) : detailProject ? (
              <DetailView
                project={detailProject}
                favorited={state.favorites.includes(detailProject.slug)}
                // 用 resolveProgress 统一解析：未收藏必须是 undefined，
                // 不能让 UI 用 `?? 'saved'` 把「没收藏」显示成「已收藏」。
                progress={resolveGuideProgress(detailProject, resolveProgress(detailProject.slug, state.favorites, state.progress))}
                percentiles={{
                  authenticity: percentiles.authenticity.get(detailProject.slug),
                  value: percentiles.value.get(detailProject.slug),
                  total: percentiles.total,
                }}
                onToggleFavorite={toggleFavorite}
                onSetProgress={(slug, status) => setProgress(slug, status, detailProject)}
                onToggleStep={(slug, step) => toggleStep(slug, step, detailProject)}
                onReviewGuide={() => reviewGuide(detailProject.slug, detailProject)}
                onBack={returnToList}
                xResult={personalX.settings?.configured ? personalX.result : undefined}
              />
            ) : (
              <div className="card">
                <h1 className="text-lg font-semibold">{detailState === 'notFound' ? '未找到该项目资料' : '项目资料加载失败'}</h1>
                <p className="mt-2 text-sm text-ink-soft">{detailError || '项目可能已移除，请返回列表查看。'}</p>
                <div className="mt-4 flex gap-3">
                  <button className="btn-primary" onClick={() => setRetryDetail(n => n + 1)}>重试加载</button>
                  <button className="btn-ghost" onClick={returnToList}>返回原列表</button>
                </div>
              </div>
            )
          ) : (
            <>
              {personalX.settings?.configured && personalX.message && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${personalX.failed ? 'border-warn/30 bg-warn-wash text-warn' : 'border-brand/20 bg-brand-50 text-brand'}`}>{personalX.message}</p>}
              <ListView
                key={route.view}
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
                localState={state}
                onImportBackup={importBackup}
                xResult={personalX.settings?.configured ? personalX.result : undefined}
                onXRefresh={() => { void personalX.refresh().catch(() => {}); }}
              />
            </>
          )}
        </Page>
      </main>
      <Footer updatedAt={dataset.updated_at} />
    </>
  );
}
