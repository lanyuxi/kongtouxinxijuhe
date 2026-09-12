/**
 * 将 data/ 下的静态 JSON 同步到 public/data/，供前端静态加载。
 *
 * 对应方案文档第 20 章：数据以 JSON 形式随仓库发布，无需数据库与 API 服务。
 * 注意：只同步「产物型」数据，不同步 seed/ 原始输入文件，
 *      避免把内部维护数据（例如原始抓取快照的输入种子）发布到前端。
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'data');
const dest = path.join(root, 'public', 'data');

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

// 说明：
//   airdrops.json      —— 列表页数据
//   source-health.json —— 数据源健康状态（前端透明展示失败来源）
//   details/           —— 详情页分片
//   live/              —— 实时抓取快照，供「一键更新」展示来源侧最新条目
//   refresh-status.json—— 抓取任务状态，供「一键更新」轮询进度
//   logo-map.json      —— 项目 logo 映射（图标文件本身在 public/logos/）
const ENTRIES = [
  'airdrops.json',
  'source-health.json',
  'refresh-status.json',
  'logo-map.json',
  'details',
  'live',
];

for (const name of ENTRIES) {
  await cp(path.join(src, name), path.join(dest, name), { recursive: true });
}
console.log(`[sync-data] data/{${ENTRIES.join(',')}} → public/data/ 完成`);
