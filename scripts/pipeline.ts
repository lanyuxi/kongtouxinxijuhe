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
import type { Dataset, RefreshStatus, SourceHealth, SourceHealthFile } from '../src/lib/types';
import { adapters } from './fetch/index';
import { normalizeAll } from './lib/normalize';
import { mergeAll } from './lib/merge';
import { applyAllSourced } from './lib/sourced';
import { verifyAll } from './lib/verify';
import { enrichAll } from './lib/enrich';
import { scoreAll } from './lib/score';
import { buildFaqAndRisks, buildGuideAndCost } from './lib/guide';
import { validateProjects } from './lib/validate';
import { describeDiff, diffProjects, projectDigest } from './lib/change';
import { writeLiveSnapshots } from './lib/live';
import type { LiveSnapshot } from './lib/live';
import { canPrune, pruneProjects } from './lib/prune';
import { loadProfiles } from './lib/enrich';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DETAILS_DIR = path.join(DATA_DIR, 'details');
const LIVE_DIR = path.join(DATA_DIR, 'live');

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
  await writeRefreshStatus({ state: 'running', started_at: now });

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

  /** 每轮抓取后持久化的实时快照（供前端「一键更新」读取来源侧最新条目） */
  const snapshots: LiveSnapshot[] = [];

  for (const adapter of adapters) {
    try {
      const items = await adapter.fetch();
      const normalized = normalizeAll(items);
      rawItems.push(...normalized);
      snapshots.push({
        fetched_at: now,
        source: adapter.name,
        source_url: adapter.url,
        items: normalized,
      });
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

  // 3) Merge → Prune → Sourced → Verify → Enrich → Verify
  //    → Guide/Cost → Score → FAQ/Risks → Digest
  let projects = mergeAll(rawItems, previousProjects);

  // 3.1) Prune：清理历史误抓的运营页 / 跳转页（仅在来源健康时执行）
  const thisRoundSlugs = new Set(rawItems.map((i) => i.slug));
  const profiles = await loadProfiles();
  const pruned = pruneProjects(
    projects,
    thisRoundSlugs,
    canPrune(health),
    new Set(Object.keys(profiles)),
  );
  projects = pruned.projects;
  if (pruned.removed.length) {
    console.log(`[pipeline] 清理 ${pruned.removed.length} 个失效条目：${pruned.removed.join('、')}`);
  }

  // 3.2) Sourced：把真实抓取到的官网 / 描述 / 教程步骤落到项目上
  //      （人工档案在 Enrich 阶段覆盖，优先级更高）
  projects = applyAllSourced(projects, rawItems);
  projects = verifyAll(projects);
  projects = await enrichAll(projects);
  // enrich 后证据变了，重新 verify 一次以生成完整 Evidence 清单
  projects = verifyAll(projects);

  // 3.3) Guide / Cost → Score → FAQ / Risks
  //
  //      顺序很关键，不能先 Score 后建成本：
  //        · 参与价值里的「任务投入产出比」依赖 cost.time_minutes
  //        · cost.time_minutes 由教程步骤推导（guide -> cost）
  //      先评分后建成本，会导致评分用的是「上一轮遗留的成本」，
  //      同一份数据连跑两次得到不同的参与价值分数（第二轮才收敛）。
  //      因此这里把 Guide/Cost 提到 Score 之前，保证一次即收敛、可复现。
  projects = projects.map((p) => buildGuideAndCost(p));
  projects = scoreAll(projects);
  projects = projects.map((p) => buildFaqAndRisks(p));

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

  // 4.5) 变化判定：剔除时间戳后逐项对比，得出真正的「实质变化」
  const diff = diffProjects(previousProjects, projects);
  console.log(`[pipeline] 变化判定：${describeDiff(diff)}`);

  // 4.6) 维护 last_changed_at / digest
  //
  //      规则：只有「实质内容」（即剔除时间戳后的指纹）变化时，才刷新 last_changed_at。
  //      否则每 10 分钟跑一次会把所有项目的时间都推成「刚刚」，
  //      前端「数据变化时间」永远显示刚刚，用户无法判断数据是否真的更新过。
  const previousBySlug = new Map(previousProjects.map((p) => [p.slug, p]));
  projects = projects.map((p) => {
    const digest = projectDigest(p);
    const prev = previousBySlug.get(p.slug);
    const prevDigest = prev ? projectDigest(prev) : undefined;
    const changed = prevDigest !== undefined && prevDigest !== digest;
    // 历史项目若连指纹都没有（首次引入本机制），保留其原有 last_changed_at
    const lastChanged =
      prev && !changed ? prev.last_changed_at : changed ? new Date().toISOString() : p.last_changed_at;
    return { ...p, digest, last_changed_at: lastChanged };
  });

  // 5) 按更新时间倒序；时间相同时用 slug 兜底比较。
  //
  //    为什么必须兜底：同一轮抓取里大量项目的 last_checked_at 完全相同
  //    （都来自同一个 fetchedAt），此时排序结果取决于入参顺序。
  //    如果顺序不稳定，落盘的 projects[] 每轮都会被重排，
  //    既产生无意义 diff，也会让「数据是否变化」的判定失真。
  projects.sort((a, b) => {
    if (a.last_checked_at !== b.last_checked_at) {
      return a.last_checked_at < b.last_checked_at ? 1 : -1;
    }
    return a.slug.localeCompare(b.slug, 'en');
  });

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

  // 7) Write live 快照：供前端「一键更新」读取来源侧最新条目（无需服务端）
  const liveIndex = await writeLiveSnapshots(LIVE_DIR, snapshots);
  console.log(
    `[pipeline] live 快照：${liveIndex.sources.length} 个来源，共 ${liveIndex.total} 条`,
  );

  // 8) Write refresh-status：供前端「一键更新」轮询进度
  const okCount = health.filter((h) => h.ok).length;
  await writeRefreshStatus({
    state: 'success',
    started_at: now,
    finished_at: new Date().toISOString(),
    sources: health.length,
    ok_sources: okCount,
    updated_at: dataset.updated_at,
    data_changed: diff.changed,
    change_summary: describeDiff(diff),
    added: diff.added.length,
    modified: diff.modified.length,
    removed: diff.removed.length,
  });

  console.log(
    `[pipeline] 完成：${projects.length} 个项目，${okCount}/${health.length} 个来源正常，今日新增 ${newToday}`,
  );
}

/** 写入抓取任务状态（失败也要写，前端据此展示真实原因） */
async function writeRefreshStatus(status: RefreshStatus) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    path.join(DATA_DIR, 'refresh-status.json'),
    JSON.stringify(status, null, 2) + '\n',
    'utf8',
  );
}

main().catch(async (e) => {
  console.error('[pipeline] 未捕获异常：', e);
  // 真实失败必须落盘：前端「一键更新」需要据此告知用户，而不是一直转圈
  await writeRefreshStatus({
    state: 'failed',
    finished_at: new Date().toISOString(),
    error: (e as Error).message,
  }).catch(() => {});
  process.exitCode = 1;
});
