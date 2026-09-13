/**
 * 相对分位（本批数据内的百分位）。
 *
 * 为什么需要它（第一性原理）：
 *   绝对分在没有参照系时几乎不携带信息。
 *   实测当前数据集：真实性均值 24.5/100，**174/188 个项目价值等级是 C**。
 *   用户看到一屏「C、C、C」，既无法横向比较，也无法判断「C 到底算好还是差」——
 *   这恰恰违背了「可解释评分」的初衷：分数可解释，但结论不可用。
 *
 *   相对分位解决的就是这件事：把「43 分」翻译成「在本批 188 个项目里排前 27%」。
 *   用户立刻能知道：这个分数在这批数据里处在什么位置。
 *
 * ⚠️ 两条必须守住的边界：
 *   1. **不动绝对分**。分位只是额外一层参照，评分逻辑、阈值、等级一律不变，
 *      否则一次改动会静默改变所有历史结论；
 *   2. **分位只表示「本批数据的相对位置」，不表示「项目本身更好」**。
 *      因此百分位越高＝分数越高，而「分数高」本身仍受数据完整度影响 ——
 *      界面文案必须写成「本批数据中相对位置」，不能写成「排名第 27，很值得参与」。
 *
 * 口径：百分位 = 分数低于样本的比例（0–100，越高越好）。
 *   与绝对分数严格单调一致，不存在「分数高但分位低」的自相矛盾。
 *   并列同分时取相同的分位（使用「低于我的样本数 / 总样本数」而非「名次」）。
 */

/** 一批样本的分位参照系 */
export interface PercentileScale {
  /** 样本数量 */
  total: number;
  /** 已排序的分数数组（升序） */
  sorted: number[];
}

/** 从一批分数建立参照系 */
export function buildScale(values: number[]): PercentileScale {
  return {
    total: values.length,
    sorted: [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b),
  };
}

/**
 * 计算单个分数的相对分位（0–100 整数，越高表示在本批中越靠前）。
 *
 * 样本不足（< 2）时不返回分位 —— 只有一个样本时「超过 0% 的项目」是废话，
 * 强行显示只会让用户误以为拿到了有意义的比较结论。
 */
export function percentileOf(value: number, scale: PercentileScale): number | null {
  if (!Number.isFinite(value) || scale.total < 2) return null;
  const below = scale.sorted.filter((v) => v < value).length;
  const pct = Math.round((below / scale.total) * 100);
  // 边界收敛：最高分不应显示「超过 100% 的项目」
  return Math.min(99, Math.max(1, pct));
}

/** 分位 → 中文短语，例如 88 → 「前 12%」 */
export function percentilePhrase(pct: number): string {
  const top = Math.max(1, 100 - pct);
  return `前 ${top}%`;
}

/** 分位 → 三档说明（用于颜色与强调，不代表「好坏」判断） */
export type PercentileBand = 'high' | 'middle' | 'low';

export function percentileBand(pct: number): PercentileBand {
  if (pct >= 70) return 'high';
  if (pct >= 30) return 'middle';
  return 'low';
}

/** 供 UI 层消费的分位集合（含参照样本量） */
export interface Percentiles {
  authenticity: Map<string, number>;
  value: Map<string, number>;
  total: number;
}

/** 一次算好整批项目的分位，避免在渲染时反复排序 */
export interface ScorePercentiles {
  authenticity: Map<string, number>;
  value: Map<string, number>;
}

export function buildPercentiles(
  projects: { slug: string; scores: { authenticity: number; value: number } }[],
): ScorePercentiles {
  const authScale = buildScale(projects.map((p) => p.scores.authenticity));
  const valueScale = buildScale(projects.map((p) => p.scores.value));
  const authenticity = new Map<string, number>();
  const value = new Map<string, number>();
  for (const p of projects) {
    const a = percentileOf(p.scores.authenticity, authScale);
    const v = percentileOf(p.scores.value, valueScale);
    if (a !== null) authenticity.set(p.slug, a);
    if (v !== null) value.set(p.slug, v);
  }
  return { authenticity, value };
}

/**
 * 相对分位的一句话说明（直接展示给用户）。
 * 文案必须同时包含「相对」与「本批」，否则会被读成绝对评价。
 */
export function percentileNote(pct: number, total: number): string {
  return `本批 ${total} 个项目中相对位置 ${percentilePhrase(pct)}`;
}
