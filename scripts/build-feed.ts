/**
 * 构建期生成 Atom feed（public/feed.xml）。
 *
 * 为什么放在「构建期」而不是流水线落盘：
 *   1. feed 是**站点产物**，不是情报数据。放进 data/ 会污染「数据实质变化」
 *      的指纹判定（feed 每条都带站点地址，改动一次就全量变化）；
 *   2. 站点地址依赖部署环境（GitHub Pages 子路径 / CNB 预览），
 *      只有构建时才知道 BASE_PATH，因此只能在这里生成；
 *   3. 纯静态托管下 public/ 会被原样复制到 dist/，正好是 feed 该待的位置。
 *
 * 用法：node --experimental-strip-types scripts/build-feed.ts   （由 npm script 包裹 tsx）
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Dataset } from '../src/lib/types';
import { buildAtomFeed, DEFAULT_SITE_URL } from './lib/feed';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 站点地址优先级：显式 SITE_URL > BASE_PATH 推导 > 默认 GitHub Pages 地址 */
export function resolveSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.SITE_URL?.trim();
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`;
  const base = env.BASE_PATH?.trim();
  if (base && /^https?:\/\//.test(base)) return base.endsWith('/') ? base : `${base}/`;
  return DEFAULT_SITE_URL;
}

async function main() {
  const dataset = JSON.parse(
    await readFile(path.join(ROOT, 'data/airdrops.json'), 'utf8'),
  ) as Dataset;

  const siteUrl = resolveSiteUrl();
  const xml = buildAtomFeed(dataset.projects, {
    siteUrl,
    updatedAt: dataset.updated_at,
  });

  await mkdir(path.join(ROOT, 'public'), { recursive: true });
  await writeFile(path.join(ROOT, 'public', 'feed.xml'), xml, 'utf8');

  const entries = (xml.match(/<entry>/g) ?? []).length;
  console.log(
    `[feed] 生成 public/feed.xml：${entries} 条条目，站点地址 ${siteUrl}，体积 ${Buffer.byteLength(xml)} 字节`,
  );
}

// 被 import（单测）时只导出函数，不产生副作用
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error('[feed] 生成失败：', e);
    process.exitCode = 1;
  });
}
