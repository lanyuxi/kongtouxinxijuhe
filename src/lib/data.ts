/**
 * 数据加载：读取构建时生成的静态 JSON。
 *
 * 对应方案文档：
 * - 第 20 章：数据直接以 JSON 放在仓库中，无需数据库
 * - 说明：不调用任何外部 API，浏览器端不出现任何 Secret（不变量 5）
 */

import type { AirdropProject, ListDataset, LogoMap, SourceHealthFile } from './types';
import { attachLogos } from './refresh';

/**
 * 站点可能部署在子路径下，因此使用相对路径加载。
 */
const BASE = import.meta.env.BASE_URL || './';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE}data/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`加载 ${file} 失败：HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * 项目 logo 映射（data/logo-map.json）。
 * 单独一张表而不是塞进每个项目里，原因有两个：
 *   1. 抓取脚本重跑时只需要改这一份文件，不会污染 airdrops.json 的「实质变化」判定；
 *   2. 图标是站点资源、不是情报内容，混进数据里会让 diff 变得难以阅读。
 */
export async function loadLogoMap(): Promise<LogoMap | null> {
  try {
    const map = await fetchJson<LogoMap>('logo-map.json');
    return map && typeof map.logos === 'object' ? map : null;
  } catch {
    return null;
  }
}

/**
 * 把 logo 路径贴到项目上。
 *
 * 路径处理成「相对站点根」的绝对形式（BASE + logos/xxx）。
 * 为什么要先转成绝对路径：详情页 / 列表页都在 hash 路由里，
 * 相对路径在不同层级下解析结果不稳定；统一成绝对路径后
 * <img src> 在任何页面下都指向同一个文件。
 *
 * ⚠️ 这段逻辑必须与「一键更新」路径共用（见 lib/refresh.ts 的 attachLogos）。
 *    历史事故：更新时只重新拉了 airdrops.json、没重新贴映射，
 *    结果更新后整站图标全部变成空白方块。
 */
export async function loadDataset(): Promise<ListDataset> {
  const [dataset, logoMap] = await Promise.all([
    fetchJson<ListDataset>('airdrops.json'),
    loadLogoMap(),
  ]);
  if (!dataset || !Array.isArray(dataset.projects)) {
    throw new Error('数据格式不正确');
  }
  return attachLogos(dataset, logoMap);
}

/**
 * 按需加载单个项目的完整详情（data/details/<slug>.json）。
 *
 * 为什么不在首屏一次性下发：
 *   完整项目里 digest / guide.description / scores.*Items / sourcedSteps / faq
 *   合计占原 3.87 MB 的绝大部分，而列表页一个字节都不用。
 *   拆开后首屏只拉 ~300 KB 的列表，点进详情再拉单个 ~16 KB 的分片。
 *
 * 返回 null 表示该分片不存在（例如项目刚被 prune、或静态托管未同步），
 * 由调用方决定回退策略；这里不抛错，避免详情页因为一个 404 整体崩掉。
 */
export async function loadProjectDetail(slug: string): Promise<AirdropProject | null> {
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return null;
  try {
    const p = await fetchJson<AirdropProject>(`details/${slug}.json`);
    return p && p.slug === slug ? p : null;
  } catch {
    return null;
  }
}

export async function loadSourceHealth(): Promise<SourceHealthFile | null> {
  try {
    return await fetchJson<SourceHealthFile>('source-health.json');
  } catch {
    return null;
  }
}

export type { AirdropProject };
