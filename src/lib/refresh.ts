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

import type { LiveIndex, RefreshStatus, Dataset } from './types';
import { loadDataset } from './data';

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

/**
 * 重新加载项目数据（一键更新后使用）。
 *
 * 必须复用 data.ts 的 loadDataset，而不是自己 fetch airdrops.json：
 * airdrops.json 里**没有** logo 字段，项目图标是在 loadDataset 里
 * 由 data/logo-map.json 拼装上去的。
 *
 * 历史 BUG（Issue #1）：这里曾直接返回 fetchNoCache<Dataset>('airdrops.json')，
 * 于是「一键更新」后 dataset 被替换成裸 JSON —— 每个项目都丢了 logo，
 * 列表页 188 个图标瞬间全部消失（只剩空占位方块）。
 * 修复方式：数据加载只保留一个入口，刷新路径复用同一个函数，
 * 避免「拼装逻辑」在两条加载路径上不一致。
 */
export async function reloadDataset(): Promise<Dataset | null> {
  try {
    // 带时间戳绕过缓存：一键更新后必须拿到最新产物，不能命中旧缓存
    const res = await fetch(`${BASE}data/airdrops.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await loadDataset();
  } catch {
    return null;
  }
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
  const dataset = await reloadDataset();
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
