/**
 * 空投情报平台数据流水线主入口。
 *
 * 流程（对应方案文档第 19 / 21 章）：
 *   Fetch → Normalize → Merge → Verify → Enrich → Score → Guide → Validate → Write JSON
 *
 * 关键约束：
 * - 第 28 章：每个 Source Adapter 独立运行，单个失败不影响整体
 * - 不变量 3：单个来源失败不能清空数据集，必须保留 Last Known Good
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type {
  AirdropProject,
  RefreshStatus,
  SourceHealth,
  SourceHealthFile,
} from '../src/lib/types';
import { adapters } from './fetch/index';
import { normalizeAll } from './lib/normalize';
import { mergeAll } from './lib/merge';
import { applyAllSourced } from './lib/sourced';
import { verifyAll } from './lib/verify';
import { enrichAll } from './lib/enrich';
import { scoreAll } from './lib/score';
import { buildFaqAndRisks, buildGuideAndCost } from './lib/guide';
import { validateProjects } from './lib/validate';
import { describeDiff, describeDiffDetails, diffProjects, projectDigest } from './lib/change';
import { writeLiveSnapshots } from './lib/live';
import type { LiveSnapshot } from './lib/live';
import { canPrune, pruneProjects } from './lib/prune';
import { reconcileAll } from './lib/status';
import { markFirstSeenAll } from './lib/first-seen';
import { loadProfiles } from './lib/enrich';
import { buildListDataset } from './lib/list';

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

/**
 * 从 data/details/ 读回全部完整项目（Last Known Good 的唯一可信来源）。
 *
 * 为什么不用 airdrops.json：它是瘦身后的列表形态，缺少 Prune / 变化判定
 * 必需的 evidence、digest 等字段（见文件头注释）。
 * 单个分片损坏时跳过而不是整体失败：宁可少一个历史项目，也不能让整轮停摆。
 */
async function readDetailProjects(dir: string): Promise<AirdropProject[]> {
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: AirdropProject[] = [];
  for (const f of files) {
    const p = await readJson<AirdropProject | null>(path.join(dir, f), null);
    if (p?.slug) out.push(p);
  }
  return out;
}

async function main() {
  const now = new Date().toISOString();
  console.log('[pipeline] 开始执行，时间：', now);
  await writeRefreshStatus({ state: 'running', started_at: now });

  // 1) 读取上一版数据（Last Known Good）
  //
  //    ⚠️ 关键：上一版**完整项目**必须从 data/details/ 读回，不能从 airdrops.json 读。
  //    因为 airdrops.json 现在是瘦身后的列表形态（见 scripts/lib/list.ts），
  //    里面没有 evidence / digest / guide.description 等字段。
  //    若用它当 Last Known Good：
  //      · Prune 会因为 `p.evidence` 为 undefined 直接抛错（曾经真实发生）；
  //      · 变化判定也会把「字段消失」误判成「内容全部变化」。
  //    details/ 才是完整项目的落盘处，因此以它为准；airdrops.json 只用于读取元信息。
  const previousFile = path.join(DATA_DIR, 'airdrops.json');
  const previousProjects = await readDetailProjects(DETAILS_DIR);
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

  // 3.15) Status 对账（P1-1）：用 tagline 的明确信号修正 status。
  //
  //       为什么必须在 Sourced 之前（而不是之后）：
  //         Sourced 会用数据源描述覆盖 tagline，而对账依据正是 tagline。
  //         顺序反了会先用旧 tagline 对账、再换成新 tagline，出现新的不一致。
  {
    const reconciled = reconcileAll(projects);
    projects = reconciled.projects;
    for (const c of reconciled.changes) console.log(`[pipeline] status 对账：${c}`);
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

  // 4.8) 首次记录时间（P2-1）：补 `first_seen_at`，让「今日新收录」的口径
  //      与用户理解一致。
  //
  //      为什么不能直接用 `discovered_at` 当「新增」：
  //        实测 2026-09-16「新增」的 13 个项目，其来源抓取时间是 9-12 ——
  //        它们不是「今天出现的空投」，而是「今天首次进入当前筛选口径」。
  //        把后者说成「今日新增」，会让用户以为每天冒出十几个新机会。
  //      `first_seen_at` 从 `created_at` 继承，历史项目不会被回填成今天。
  {
    const marked = markFirstSeenAll(projects, new Date(now));
    projects = marked.projects;
    if (marked.backfilled) {
      console.log(`[pipeline] first_seen_at：为 ${marked.backfilled} 个历史项目回填首次记录时间`);
    }
  }

  const startOfDay = new Date(now.slice(0, 10) + 'T00:00:00Z').getTime();
  // 「今日新收录」= 首次记录时间落在今天的项目数。
  // 命名从 new_today 的旧语义（今日进入筛选范围）改为「今日首次收录」，
  // 与磁贴文案、以及 first_seen_at 的口径严格一致。
  const newToday = projects.filter(
    (p) => new Date(p.first_seen_at ?? p.discovered_at).getTime() >= startOfDay,
  ).length;

  /**
   * 列表数据集：**只含卡片/筛选/排序所需字段**。
   *
   * 为什么不再把完整项目写进 airdrops.json：
   *   完整数据里 digest / guide.description / scores.*Items / sourcedSteps / faq
   *   合计占 3.87 MB 的绝大部分，而列表页一个字节都不用。
   *   详情页改为按需拉取 data/details/<slug>.json（见 src/lib/data.ts）。
   *   这里仍保留新字段名 new_today / updated_at，前端协议不变。
   */
  // 注意：这是**列表数据集**，类型与内部 projects 不同（见 scripts/lib/list.ts）。
  // 不要把它赋给 Dataset —— 那会让 TS 误以为后续还能拿到 evidence / faq。
  const dataset = buildListDataset(projects, {
    updated_at: now,
    new_today: newToday,
  });

  // 6) Write JSON：列表（瘦身）+ 详情分片（完整）+ 数据源健康
  await mkdir(DETAILS_DIR, { recursive: true });
  await writeFile(previousFile, JSON.stringify(dataset, null, 2) + '\n', 'utf8');

  // 关键：先清掉上一轮的详情分片，避免被 prune 的项目留下孤儿文件。
  // 否则 slug 变更后 dist 里会残留旧项目详情，白占体积还可能被误读为「仍存在」。
  await rm(DETAILS_DIR, { recursive: true, force: true });
  await mkdir(DETAILS_DIR, { recursive: true });

  for (const p of projects) {
    await writeFile(
      path.join(DETAILS_DIR, `${p.slug}.json`),
      JSON.stringify(p, null, 2) + '\n',
      'utf8',
    );
  }

  // 6.1) 清理**孤儿分片**：已经不在数据集里的 slug，其 data/details/<slug>.json 必须删除。
  //
  //      为什么必须做（P0-1 的核心一环）：
  //        分片目录由「先 rm -rf 再全量重写」维护，但只要有一次是手工提交、
  //        或者某个中间版本的写入被中断，残片就会永久留在仓库里。
  //        实测 2026-09-16：56 个孤儿分片，其中 binance-cex.json 的
  //        recommendation.action 仍是「可参与」，任何消费 data/details/ 的
  //        程序（含历史版本前端 / 外部索引 / 脚本）都会把交易所读成空投项目。
  //        这类「已出库但仍可被读到」的残留，比列表页上的错误更隐蔽。
  const orphans = await cleanupOrphanDetails(new Set(projects.map((p) => p.slug)));
  if (orphans.length) {
    console.log(`[pipeline] 清理孤儿分片 ${orphans.length} 个：${orphans.join('、')}`);
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
    change_details: describeDiffDetails(diff, 5),
    added: diff.added.length,
    modified: diff.modified.length,
    removed: diff.removed.length,
  });

  console.log(
    `[pipeline] 完成：${projects.length} 个项目，${okCount}/${health.length} 个来源正常，今日新增 ${newToday}`,
  );
}

/**
 * 删除 data/details 下「不在当前数据集里」的分片文件。
 *
 * 只删除 `.json` 分片，且只删除 slug 确实已出库的文件；
 * 任何读取失败都视为「无法确认 → 不删除」，宁留勿误删。
 */
async function cleanupOrphanDetails(liveSlugs: Set<string>): Promise<string[]> {
  const removed: string[] = [];
  let files: string[];
  try {
    files = await readdir(DETAILS_DIR);
  } catch {
    return removed;
  }
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const slug = file.slice(0, -'.json'.length);
    if (liveSlugs.has(slug)) continue;
    try {
      await rm(path.join(DETAILS_DIR, file), { force: true });
      removed.push(slug);
    } catch {
      /* 删不掉就留着，不影响本轮发布 */
    }
  }
  return removed;
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
