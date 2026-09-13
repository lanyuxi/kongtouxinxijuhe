import { useEffect, useMemo, useState } from 'react';
import { Header, Footer, Page } from './components/Layout';
import { Onboarding } from './components/Onboarding';
import type { NavKey } from './components/Layout';
import { ListView } from './pages/ListView';
import { DetailView } from './pages/DetailView';
import { SafetyView } from './pages/SafetyView';
import { loadDataset, loadSourceHealth } from './lib/data';
import { loadLiveIndex, runRefresh } from './lib/refresh';
import type { LiveIndex } from './lib/types';
import { useRoute } from './lib/router';
import { useLocalState } from './lib/store';
import type { AirdropProject, Dataset, SourceHealthFile } from './lib/types';

export function App() {
  const route = useRoute();
  const { state, toggleFavorite, setProgress, toggleStep, clearAll } = useLocalState();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [health, setHealth] = useState<SourceHealthFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 「一键更新」状态：进度文案 + 来源索引（用于展示数据新鲜度）
  const [liveIndex, setLiveIndex] = useState<LiveIndex | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

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

  const detailProject = useMemo<AirdropProject | null>(() => {
    if (route.kind !== 'detail') return null;
    return projects.find((p) => p.slug === route.slug) ?? null;
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
          <div className="card text-sm text-ink-soft">正在加载空投数据…</div>
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
            detailProject ? (
              <DetailView
                project={detailProject}
                favorited={state.favorites.includes(detailProject.slug)}
                progress={state.progress[detailProject.slug]}
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
  return (
    <div className="card mb-4 border-warn/40 bg-warn-wash">
      <p className="text-sm text-warn">
        ⚠ 以下数据源本次抓取失败，已保留其上次成功数据：
        {failed.map((s) => s.name).join('、')}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        失败原因：{failed.map((s) => `${s.name}（${s.error ?? '未知错误'}）`).join('；')}
      </p>
    </div>
  );
}
