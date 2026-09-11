/**
 * 将 data/ 下的静态 JSON 同步到 public/data/，供前端静态加载。
 *
 * 对应方案文档第 20 章：数据以 JSON 形式随仓库发布，无需数据库与 API 服务。
 * 注意：只同步「产物型」数据（airdrops / details / source-health），
 * 不同步 seed/ 原始输入文件，避免把内部维护数据发布到前端。
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'data');
const dest = path.join(root, 'public', 'data');

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

for (const name of ['airdrops.json', 'source-health.json', 'details']) {
  await cp(path.join(src, name), path.join(dest, name), { recursive: true });
}
console.log('[sync-data] data/{airdrops.json,source-health.json,details} → public/data/ 完成');
