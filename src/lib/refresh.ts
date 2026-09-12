/**
 * 「一键更新」前端逻辑。
 *
 * 设计前提（务必先读）：本站是纯静态站点，没有服务端。
 * 因此「一键更新」= 触发仓库既有的抓取任务 + 轮询结果，
 * 而不是让浏览器自己去抓第三方站点。
 *
 * 为什么不让浏览器直接抓：
 *   1. 第三方站点普遍不返回 CORS 头，浏览器直连必然被拦；
 *   2. 会把用户真实 IP 暴露给每一个数据源；
 *   3. 抓取逻辑会分裂成两份（前端一份、流水线一份），长期必然不一致。
 */

import type { LiveIndex, RefreshStatus, Dataset, LogoMap } from './types';

const BASE = import.meta.env.BASE_URL || './';

/** 超过这个分钟数就认为数据已过期（与定时任务的 10 分钟对齐，留一点余量） */
export const STALE_MINUTES = 15;

/** 轮询参数：最多等 5 分钟，每 5 秒一次 */
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000;

async function fetchNoCache<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}data/${file}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadLiveIndex(): Promise<LiveIndex | null> {
  return fetchNoCache<LiveIndex>('live/live-index.json');
}

export async function loadRefreshStatus(): Promise<RefreshStatus | null> {
  return fetchNoCache<RefreshStatus>('refresh-status.json');
}

export async function reloadDataset(): Promise<Dataset | null> {
  return fetchNoCache<Dataset>('airdrops.json');
}

/**
 * 重新加载图标映射（data/logo-map.json）。
 *
 * 为什么「一键更新」必须把这张表也重新拉一遍（这是一个真实踩过的坑）：
 *   logo 路径是在加载数据集时由 logo-map.json 贴到项目上的（见 lib/data.ts）。
 *   而更新后新拉到的 airdrops.json 里的项目**本身不带 logo 字段**，
 *   如果只换数据集、不重新贴映射，前端就会认为「所有项目都没有图标」，
 *   整站 188 个图标一起变成空白方块。
 *   用户看到的正是「点一下一键更新，所有图标都没了」。
 *
 *   顺带把路径规则与 lib/data.ts 保持一致（绝对路径 + BASE），
 *   否则从 hash 路由进入详情页时相对路径会解析到错误的层级。
 */
export async function reloadLogoMap(): Promise<LogoMap | null> {
  return fetchNoCache<LogoMap>('logo-map.json');
}

/**
 * 把图标映射贴到数据集上。
 * 与 lib/data.ts 的 loadDataset 使用同一套规则，避免两处实现漂移。
 */
export function attachLogos(dataset: Dataset, logoMap: LogoMap | null): Dataset {
  if (!logoMap || typeof logoMap.logos !== 'object') return dataset;
  const logos = logoMap.logos;
  return {
    ...dataset,
    projects: dataset.projects.map((p) => {
      const file = logos[p.slug];
      return file ? { ...p, logo: `${BASE}${file}` } : p;
    }),
  };
}

/** 数据是否已过期 */
export function isStale(index: LiveIndex | null, now = Date.now()): boolean {
  if (!index?.updated_at) return true;
  const t = new Date(index.updated_at).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > STALE_MINUTES * 60 * 1000;
}

/**
 * 触发仓库抓取任务。
 *
 * 说明：静态站点本身没有触发能力，因此这里采用「尽力而为」策略：
 *   - 若部署环境提供了触发器地址（构建期注入 PUBLIC_REFRESH_ENDPOINT），
 *     则发一个 POST 过去；
 *   - 否则返回 false，由调用方降级为「仅重新拉取远端 JSON」。
 *
 * 这样做的好处：功能在任何部署方式下都不会「点了没反应」，
 * 只是更新强度不同（完全重算 vs 拉取定时任务的最新产物）。
 */
export async function triggerRefresh(): Promise<{ triggered: boolean; detail: string }> {
  const endpoint = import.meta.env.VITE_REFRESH_ENDPOINT as string | undefined;
  if (!endpoint) {
    return { triggered: false, detail: '未配置触发器，已改为重新拉取最新数据' };
  }
  try {
    const res = await fetch(endpoint, { method: 'POST', mode: 'cors' });
    return {
      triggered: res.ok,
      detail: res.ok ? '已触发抓取任务' : `触发失败：HTTP ${res.status}`,
    };
  } catch (e) {
    return { triggered: false, detail: `触发失败：${(e as Error).message}` };
  }
}

export interface RefreshOutcome {
  dataset: Dataset | null;
  index: LiveIndex | null;
  changed: boolean;
  message: string;
}

/**
 * 执行一次完整刷新：
 *   1. 读当前状态（拿到 updated_at 基线）
 *   2. 触发抓取（尽力而为）
 *   3. 轮询，直到 updated_at 变化或超时
 *   4. 拉取最新数据
 */
export async function runRefresh(
  baseline: string | null,
  onProgress?: (msg: string) => void,
): Promise<RefreshOutcome> {
  onProgress?.('正在检查数据源…');

  const trigger = await triggerRefresh();
  onProgress?.(trigger.detail);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let index = await loadLiveIndex();

  // 只有「触发成功」才值得等待；否则直接走快路径拿最新产物
  if (trigger.triggered) {
    onProgress?.('抓取任务已启动，等待结果…');
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const next = await loadLiveIndex();
      if (next?.updated_at && next.updated_at !== baseline) {
        index = next;
        break;
      }
      const status = await loadRefreshStatus();
      if (status?.state === 'failed') {
        onProgress?.(`抓取失败：${status.error ?? '未知原因'}`);
        break;
      }
      onProgress?.('抓取任务运行中…');
    }
  }

  onProgress?.('正在加载最新数据…');
  // 数据集与图标映射必须一起换新，否则更新完会把所有图标「贴丢」
  const [rawDataset, logoMap] = await Promise.all([reloadDataset(), reloadLogoMap()]);
  const dataset = rawDataset ? attachLogos(rawDataset, logoMap) : null;
  const changed = !!index?.updated_at && index.updated_at !== baseline;

  // 用「实质变化」而非「跑过一轮」来措辞：
  // 定时任务每 10 分钟跑一次，但绝大多数轮次内容并没有变化，
  // 如果一律说「已更新到最新数据」，用户会以为数据真的变了。
  const status = await loadRefreshStatus();
  const summary = status?.change_summary;
  const dataChanged = status?.data_changed;

  let message: string;
  if (changed) {
    message = dataChanged === false ? '已是最新数据（本轮无内容变化）' : '已更新到最新数据';
  } else if (trigger.triggered) {
    message = '抓取任务已提交，数据暂未变化';
  } else {
    message = '已重新拉取最新数据（数据源无变化）';
  }
  if (summary && summary !== '无实质变化') message += `：${summary}`;

  return { dataset, index, changed, message };
}
