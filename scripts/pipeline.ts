/**
 * DropLens 数据流水线主入口。
 *
 * 流程（对应方案文档第 19 / 21 章）：
 *   Fetch → Normalize → Merge → Verify → Enrich → Score → Guide → Validate → Write JSON
 *
 * 关键约束：
 * - 第 28 章：每个 Source Adapter 独立运行，单个失败不影响整体
 * - 不变量 3：单个来源失败不能清空数据集，必须保留 Last Known Good
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Dataset, SourceHealth, SourceHealthFile } from '../src/lib/types';
import { adapters } from './fetch/index';
import { normalizeAll } from './lib/normalize';
import { mergeAll } from './lib/merge';
import { verifyAll } from './lib/verify';
import { enrichAll } from './lib/enrich';
import { scoreAll } from './lib/score';
import { generateAll } from './lib/guide';
import { validateProjects } from './lib/validate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DETAILS_DIR = path.join(DATA_DIR, 'details');

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const now = new Date().toISOString();
  console.log('[pipeline] 开始执行，时间：', now);

  // 1) 读取上一版数据（Last Known Good）
  const previousFile = path.join(DATA_DIR, 'airdrops.json');
  const previousDataset = await readJson<Dataset | null>(previousFile, null);
  const previousProjects = previousDataset?.projects ?? [];
  const previousHealth = await readJson<SourceHealthFile | null>(
    path.join(DATA_DIR, 'source-health.json'),
    null,
  );

  // 2) Fetch：每个 Adapter 独立运行 + 错误隔离
  const health: SourceHealth[] = [];
  const rawItems: ReturnType<typeof normalizeAll> = [];

  for (const adapter of adapters) {
    try {
      const items = await adapter.fetch();
      const normalized = normalizeAll(items);
      rawItems.push(...normalized);
      health.push({
        name: adapter.name,
        url: adapter.url,
        ok: true,
        fetched: normalized.length,
        last_success_at: now,
        checked_at: now,
      });
      console.log(`[pipeline] ✓ ${adapter.name} 抓取 ${normalized.length} 条`);
    } catch (e) {
      const msg = (e as Error).message;
      const prev = previousHealth?.sources.find((s) => s.name === adapter.name);
      health.push({
        name: adapter.name,
        url: adapter.url,
        ok: false,
        fetched: 0,
        error: msg,
        last_success_at: prev?.last_success_at,
        checked_at: now,
      });
      // 关键：不抛出，继续执行下一个来源
      console.warn(`[pipeline] ✗ ${adapter.name} 抓取失败（已隔离）：${msg}`);
    }
  }

  // 3) Merge → Verify → Enrich → Score → Guide
  let projects = mergeAll(rawItems, previousProjects);
  projects = verifyAll(projects);
  projects = await enrichAll(projects);
  // enrich 后证据变了，重新 verify 一次以生成完整 Evidence 清单
  projects = verifyAll(projects);
  projects = scoreAll(projects);
  projects = projects.map((p) => generateAll(p));

  // 4) Validate：不通过则拒绝发布
  const result = validateProjects(projects);
  if (result.warnings.length) {
    for (const w of result.warnings) console.warn(`[pipeline] ⚠ ${w}`);
  }
  if (!result.ok) {
    for (const err of result.errors) console.error(`[pipeline] ✗ ${err}`);
    console.error('[pipeline] 校验失败，保留上一版数据，不执行写入。');
    process.exitCode = 1;
    return;
  }

  // 5) 按更新时间倒序
  projects.sort((a, b) => (a.last_checked_at < b.last_checked_at ? 1 : -1));

  const startOfDay = new Date(now.slice(0, 10) + 'T00:00:00Z').getTime();
  const newToday = projects.filter(
    (p) => new Date(p.discovered_at).getTime() >= startOfDay,
  ).length;

  const dataset: Dataset = {
    updated_at: now,
    new_today: newToday,
    projects,
  };

  // 6) Write JSON：列表 + 详情分片 + 数据源健康
  await mkdir(DETAILS_DIR, { recursive: true });
  await writeFile(previousFile, JSON.stringify(dataset, null, 2) + '\n', 'utf8');

  for (const p of projects) {
    await writeFile(
      path.join(DETAILS_DIR, `${p.slug}.json`),
      JSON.stringify(p, null, 2) + '\n',
      'utf8',
    );
  }

  const healthFile: SourceHealthFile = { updated_at: now, sources: health };
  await writeFile(
    path.join(DATA_DIR, 'source-health.json'),
    JSON.stringify(healthFile, null, 2) + '\n',
    'utf8',
  );

  const okCount = health.filter((h) => h.ok).length;
  console.log(
    `[pipeline] 完成：${projects.length} 个项目，${okCount}/${health.length} 个来源正常，今日新增 ${newToday}`,
  );
}

main().catch((e) => {
  console.error('[pipeline] 未捕获异常：', e);
  process.exitCode = 1;
});
