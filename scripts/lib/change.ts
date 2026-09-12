/**
 * Change：判断「数据是否发生了实质变化」。
 *
 * 背景（这是一个真实踩过的坑）：
 *   定时流水线每 10 分钟跑一次，如果直接 `git diff --quiet -- data/` 判断，
 *   每轮都会判定为「有变化」，因为 data/ 里天然带着一批只反映「什么时候跑的」的字段：
 *     - 项目级：last_checked_at（每轮必变）
 *     - 来源级：sources[].fetched_at（每轮必变）
 *     - 文件级：updated_at / checked_at / finished_at
 *   结果就是：
 *     1) 每 10 分钟产生一次无意义提交与一次 GitHub 推送；
 *     2) 前端「数据变化时间」永远显示「刚刚」，用户无法判断数据到底有没有更新。
 *
 * 因此这里把「实质内容」与「运行时刻」严格分开：
 *   - 实质内容（digest）：项目名、状态、评分、成本、教程、证据、来源地址等
 *   - 运行时刻（忽略）：上述时间戳字段
 *
 * 另一个必须处理的细节是 `undefined`：
 *   JSON.stringify 会把 `{ a: undefined }` 序列化成 `{}`，
 *   于是「对象里有这个键但值是 undefined」与「对象里没有这个键」在落盘后无法区分。
 *   若比较时不剔除，上一轮内存里的 `evidenceUrl: undefined` 与
 *   本轮从磁盘读回的「没有该键」会被误判成两次不同的数据。
 *   所以 canonicalize 阶段会把值为 undefined 的键直接删掉。
 *
 * 第三个细节是把时间戳统一归一：
 *   同一次运行内，内存中的项目带的是「本轮抓取时刻」，
 *   而磁盘上的上一版带的是「上一轮抓取时刻」。
 *   直接比较会永久误判为有变化，因此比较前统一替换成占位符。
 */

import type { AirdropProject, Dataset } from '../../src/lib/types';

/**
 * 只反映「什么时候跑的」、不反映「内容是什么」的字段。
 * 这些字段在指纹计算时被替换为占位符，不参与变化判定。
 */
export const VOLATILE_TIMESTAMP_KEYS = [
  'last_checked_at',
  'last_changed_at',
  'fetched_at',
  'discovered_at',
  'created_at',
  'updated_at',
  'checked_at',
  'last_success_at',
  'finished_at',
  'started_at',
  // live 快照里的归一化条目使用 camelCase（NormalizedItem.fetchedAt），
  // 它是「什么时候抓的」，不是内容，同样必须剔除。
  'fetchedAt',
] as const;

const VOLATILE = new Set<string>(VOLATILE_TIMESTAMP_KEYS);

/** 占位符：所有时间戳归一为同一个值，从而「不参与比较」 */
const TIME_PLACEHOLDER = '<time>';

/**
 * 把任意值转成「稳定、可比较」的结构：
 *   1) 值为 undefined 的键直接删除（与 JSON 落盘后的形态对齐）
 *   2) 时间戳字段统一替换为占位符
 *   3) 对象键排序，避免键顺序影响比较结果
 */
export function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v) ?? null);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const raw = (value as Record<string, unknown>)[key];
      if (raw === undefined) continue; // 落盘后会消失，比较时也不应参与
      out[key] = VOLATILE.has(key)
        ? TIME_PLACEHOLDER
        : (canonicalize(raw) as unknown);
    }
    return out;
  }
  return value;
}

/** 稳定序列化：先规范化，再输出确定性字符串 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * 指纹自身的「元字段」，永不计入指纹。
 *
 * 为什么必须排除：
 *   digest 是要被写回项目并落盘的。如果它参与自己的计算，
 *   就会形成自引用：内存里算出的 fingerprint(A) 与磁盘上读回后
 *   再算的 fingerprint(A + digest) 不相等，导致每轮都被误判为「已变化」。
 *   last_changed_at 同理 —— 它由变化判定结果决定，不能反过来影响判定。
 */
const DIGEST_META_KEYS = new Set(['digest', 'last_changed_at']);

/**
 * 计算单个项目的「实质内容」指纹。
 *
 * 排除两类字段：
 *   1) 运行时刻（last_checked_at / fetched_at / …）—— 每轮必变，不代表内容变化
 *   2) 指纹元字段（digest / last_changed_at）—— 由指纹自身决定，参与会形成自引用
 */
export function projectDigest(p: AirdropProject): string {
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (DIGEST_META_KEYS.has(k)) continue;
    clone[k] = v;
  }
  return stableStringify(clone);
}

/** 计算项目集合的集体指纹（顺序无关） */
export function projectsDigest(projects: AirdropProject[]): string {
  return stableStringify(
    [...projects.map((p) => projectDigest(p))].sort(),
  );
}

export interface DiffResult {
  /** 是否发生实质变化 */
  changed: boolean;
  /** 新增的项目 slug */
  added: string[];
  /** 移除的项目 slug */
  removed: string[];
  /** 内容发生变化的项目 slug */
  modified: string[];
  /** 数据源健康状态是否有实质变化（不计时间戳） */
  healthChanged: boolean;
}

/** 对比两组项目，给出人类可读的差异明细 */
export function diffProjects(
  before: AirdropProject[],
  after: AirdropProject[],
): DiffResult {
  const beforeMap = new Map(before.map((p) => [p.slug, projectDigest(p)]));
  const afterMap = new Map(after.map((p) => [p.slug, projectDigest(p)]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [slug, digest] of afterMap) {
    const prev = beforeMap.get(slug);
    if (prev === undefined) added.push(slug);
    else if (prev !== digest) modified.push(slug);
  }
  for (const slug of beforeMap.keys()) {
    if (!afterMap.has(slug)) removed.push(slug);
  }

  added.sort();
  removed.sort();
  modified.sort();

  return {
    changed: added.length > 0 || removed.length > 0 || modified.length > 0,
    added,
    removed,
    modified,
    healthChanged: false,
  };
}

/** 对比两份数据集（含来源健康状态） */
export function diffDatasets(
  before: Dataset | null,
  after: Dataset,
  beforeHealth?: unknown,
  afterHealth?: unknown,
): DiffResult {
  const result = diffProjects(before?.projects ?? [], after.projects);
  const healthChanged =
    stableStringify(beforeHealth ?? null) !== stableStringify(afterHealth ?? null);

  return {
    ...result,
    healthChanged,
    changed: result.changed || healthChanged,
  };
}

/** 生成一行人类可读的差异摘要，便于日志与 Issue 归档 */
export function describeDiff(d: DiffResult): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`新增 ${d.added.length}`);
  if (d.removed.length) parts.push(`移除 ${d.removed.length}`);
  if (d.modified.length) parts.push(`变更 ${d.modified.length}`);
  if (d.healthChanged) parts.push('来源状态变化');
  return parts.length ? parts.join('、') : '无实质变化';
}
