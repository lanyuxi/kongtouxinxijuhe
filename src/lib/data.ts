/**
 * 数据加载：读取构建时生成的静态 JSON。
 *
 * 对应方案文档：
 * - 第 20 章：数据直接以 JSON 放在仓库中，无需数据库
 * - 说明：不调用任何外部 API，浏览器端不出现任何 Secret（不变量 5）
 */

import type { AirdropProject, Dataset, SourceHealthFile } from './types';

/**
 * 站点可能部署在子路径下，因此使用相对路径加载。
 */
const BASE = import.meta.env.BASE_URL || './';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}data/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`加载 ${file} 失败：HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadDataset(): Promise<Dataset> {
  const dataset = await fetchJson<Dataset>('airdrops.json');
  if (!dataset || !Array.isArray(dataset.projects)) {
    throw new Error('数据格式不正确');
  }
  return dataset;
}

export async function loadSourceHealth(): Promise<SourceHealthFile | null> {
  try {
    return await fetchJson<SourceHealthFile>('source-health.json');
  } catch {
    return null;
  }
}

export type { AirdropProject };
