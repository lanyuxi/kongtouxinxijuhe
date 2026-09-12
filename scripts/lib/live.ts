/**
 * Live：实时抓取快照的持久化。
 *
 * 目的（对应「一键更新」需求）：
 *   前端需要一个「不依赖构建、可以随时读取」的实时数据入口。
 *   流水线每轮抓取后会把归一化条目写入 data/live/<source>.json，
 *   前端只读这些 JSON，从而做到：
 *     - 无需服务端（保持方案「零服务器」约束）
 *     - 一键更新时先展示「来源侧最新条目」，再触发完整重算
 *
 * 设计取舍：这里存的是**归一化条目**而不是原始 HTML，
 * 体积小（约几十 KB）、结构稳定、且不泄露任何凭据。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { NormalizedItem } from './normalize';

export const LIVE_DIR = 'data/live';
export const LIVE_INDEX = 'live-index.json';

export interface LiveSnapshot {
  /** 抓取时间 */
  fetched_at: string;
  /** 数据源名 */
  source: string;
  /** 数据源主页 */
  source_url: string;
  /** 归一化条目 */
  items: NormalizedItem[];
}

export interface LiveIndex {
  updated_at: string;
  sources: {
    source: string;
    source_url: string;
    fetched_at: string;
    count: number;
    /** 快照文件相对 data/ 的路径 */
    file: string;
  }[];
  total: number;
}

/** 数据源名 → 安全文件名 */
export function sourceFileName(source: string): string {
  return `${source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}.json`;
}

export async function readLiveSnapshots(dir: string): Promise<LiveSnapshot[]> {
  let index: LiveIndex;
  try {
    index = JSON.parse(await readFile(`${dir}/${LIVE_INDEX}`, 'utf8')) as LiveIndex;
  } catch {
    return [];
  }
  const out: LiveSnapshot[] = [];
  for (const s of index.sources ?? []) {
    try {
      out.push(JSON.parse(await readFile(`${dir}/${s.file}`, 'utf8')) as LiveSnapshot);
    } catch {
      /* 单个快照损坏不影响其它来源 */
    }
  }
  return out;
}

/**
 * @param dir  live 目录的绝对路径（例如 <root>/data/live）
 * @param dataDir data 目录的绝对路径（用于生成相对 data/ 的引用路径）
 */
export async function writeLiveSnapshots(
  dir: string,
  snapshots: LiveSnapshot[],
): Promise<LiveIndex> {
  await mkdir(dir, { recursive: true });
  const index: LiveIndex = {
    updated_at: new Date().toISOString(),
    sources: [],
    total: 0,
  };

  for (const snap of snapshots) {
    const name = sourceFileName(snap.source);
    const file = `${LIVE_DIR}/${name}`;
    await writeFile(`${dir}/${name}`, JSON.stringify(snap, null, 2) + '\n', 'utf8');
    index.sources.push({
      source: snap.source,
      source_url: snap.source_url,
      fetched_at: snap.fetched_at,
      count: snap.items.length,
      file,
    });
    index.total += snap.items.length;
  }

  await writeFile(`${dir}/${LIVE_INDEX}`, JSON.stringify(index, null, 2) + '\n', 'utf8');
  return index;
}
