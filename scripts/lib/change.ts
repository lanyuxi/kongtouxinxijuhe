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

/**
 * 单个项目的「变更明细」。
 * 只记录人类能看懂的字段级差异，例如「状态：潜在空投 → 开放领取」。
 */
export interface ProjectChange {
  slug: string;
  /** 项目名（找不到时退化为 slug） */
  name: string;
  /** 人类可读的变更点，例如 ['状态：潜在空投 → 开放领取'] */
  changes: string[];
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
  /** 内容变化的项目明细（比 modified 更有信息量，供前端与状态文件展示） */
  modifiedDetails: ProjectChange[];
  /** 数据源健康状态是否有实质变化（不计时间戳） */
  healthChanged: boolean;
}

/** 对比两组项目，给出人类可读的差异明细 */
export function diffProjects(
  before: AirdropProject[],
  after: AirdropProject[],
): DiffResult {
  const beforeMap = new Map(before.map((p) => [p.slug, p]));
  const afterMap = new Map(after.map((p) => [p.slug, p]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  const modifiedDetails: ProjectChange[] = [];

  for (const [slug, next] of afterMap) {
    const prev = beforeMap.get(slug);
    if (prev === undefined) {
      added.push(slug);
      continue;
    }
    if (projectDigest(prev) === projectDigest(next)) continue;
    modified.push(slug);
    modifiedDetails.push({
      slug,
      name: next.name || slug,
      changes: describeProjectChanges(prev, next),
    });
  }
  for (const slug of beforeMap.keys()) {
    if (!afterMap.has(slug)) removed.push(slug);
  }

  added.sort();
  removed.sort();
  modified.sort();
  modifiedDetails.sort((a, b) => a.slug.localeCompare(b.slug, 'en'));

  return {
    changed: added.length > 0 || removed.length > 0 || modified.length > 0,
    added,
    removed,
    modified,
    modifiedDetails,
    healthChanged: false,
  };
}

/**
 * 逐字段对比两个项目，产出「人话」变更点。
 *
 * 为什么不用 diff 的原始输出：
 *   项目对象有 20+ 字段、嵌套三层，原始 diff 既长又难懂。
 *   用户真正关心的是「状态变了吗、评分变了吗、成本变了吗」，
 *   因此这里只挑出可读性最高的几类字段做中文描述。
 *
 * 返回值最多 3 条，避免摘要过长；没有命中已知字段时回退为「内容有更新」。
 */
export function describeProjectChanges(
  before: AirdropProject,
  after: AirdropProject,
): string[] {
  const out: string[] = [];

  if (before.status !== after.status) {
    out.push(`状态：${STATUS_TEXT[before.status] ?? before.status} → ${STATUS_TEXT[after.status] ?? after.status}`);
  }
  if (before.scores.grade !== after.scores.grade) {
    out.push(`价值等级：${before.scores.grade} → ${after.scores.grade}`);
  }
  if (before.scores.risk !== after.scores.risk) {
    out.push(`风险：${RISK_TEXT[before.scores.risk] ?? before.scores.risk} → ${RISK_TEXT[after.scores.risk] ?? after.scores.risk}`);
  }
  if (out.length < 3 && before.scores.authenticity !== after.scores.authenticity) {
    out.push(`真实性：${before.scores.authenticity} → ${after.scores.authenticity}`);
  }
  if (out.length < 3 && before.scores.value !== after.scores.value) {
    out.push(`参与价值：${before.scores.value} → ${after.scores.value}`);
  }
  if (out.length < 3 && before.guide_source !== after.guide_source) {
    const LABEL: Record<string, string> = {
      sourced: '教程：升级为官方可追溯教程',
      third_party: '教程：改为第三方整理',
      template: '教程：转为流程示意',
    };
    out.push(LABEL[after.guide_source] ?? '教程来源有变化');
  }
  if (out.length < 3 && before.cost.capital_max_usd !== after.cost.capital_max_usd) {
    out.push(`资金门槛：$${before.cost.capital_max_usd} → $${after.cost.capital_max_usd}`);
  }
  if (out.length < 3 && before.evidence.length !== after.evidence.length) {
    out.push(`证据：${before.evidence.length} → ${after.evidence.length} 条`);
  }

  // 去重后截断
  const uniq = Array.from(new Set(out)).slice(0, 3);
  return uniq.length ? uniq : ['内容有更新'];
}

/** 状态 → 中文（与前端 labels 保持一致，避免前端依赖脚本层） */
const STATUS_TEXT: Record<string, string> = {
  new: '新发现',
  potential: '潜在空投',
  confirmed: '已确认',
  claim_live: '开放领取',
  ended: '已结束',
};

const RISK_TEXT: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '极高',
};

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

/**
 * 生成一行人类可读的差异摘要。
 *
 * 旧实现只输出「变更 188」这种纯计数，对回访用户毫无信息量：
 * 用户想知道的是「A 从潜在→已确认」这种具体变化。
 * 新实现优先列出项目级明细（最多 3 条），计数作为兜底与补充。
 */
export function describeDiff(d: DiffResult): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`新增 ${d.added.length} 个`);
  if (d.removed.length) parts.push(`移除 ${d.removed.length} 个`);
  if (d.modified.length) parts.push(`变更 ${d.modified.length} 个`);
  if (d.healthChanged) parts.push('来源状态变化');

  const head = parts.length ? parts.join('、') : '无实质变化';

  const details = describeDiffDetails(d, 3);
  return details.length ? `${head}：${details.join('；')}` : head;
}

/**
 * 生成项目级变更明细文案，例如
 *   ['Aave V3 状态：潜在空投 → 开放领取', 'Monad 真实性：24 → 61']
 *
 * 单条最多列出项目名 + 一个变更点，避免状态文件被撑爆（refresh-status.json
 * 会被前端轮询读取，体积必须可控）。
 */
export function describeDiffDetails(d: DiffResult, limit = 3): string[] {
  const lines: string[] = [];
  for (const item of d.modifiedDetails.slice(0, limit)) {
    const change = item.changes[0] ?? '内容有更新';
    lines.push(`${item.name} ${change}`);
  }
  return lines;
}
