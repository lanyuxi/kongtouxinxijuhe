/**
 * 数据透明度：库内数据 vs 本轮来源的覆盖率对比（P2-2）。
 *
 * 背景（上轮审查 P2-2）：
 *   前端的数据源工具条只看 `source-health.json` 的 `ok` 字段，
 *   于是永远显示「2/2 来源正常」。但实测：
 *     - `data/source-health.json`   → 本轮 2 个来源全部成功
 *     - `data/live/defillama.json`  → 本轮 120 条
 *     - `data/airdrops.json`        → 库内 202 个项目（含历史留存，来自已停收的来源）
 *
 *   也就是说「本轮抓取」与「库内留存」是两批不同的数据，
 *   而界面**无法表达这层差异**。用户看到「全部来源正常」，
 *   合理地以为「库里的每一条都是刚刚抓到的」。
 *
 * 设计取舍：
 *   1. **不隐藏差异**，而是解释它：库内多于本轮是**正常且必要**的
 *      （Last Known Good 机制要求保留历史数据，否则来源抖动会清空全库）。
 *      关键是让用户知道「多出来的那部分是历史留存」。
 *   2. **来源失败优先**：来源不健康时先说来源问题，而不是讲覆盖率 ——
 *      此时覆盖率差异的原因已经明确，再讲一次是噪音。
 *   3. 阈值保守：只有差异超过一半时才升级为警示，避免常态性告警被忽略。
 */

export interface CoverageGapInput {
  /** 库内项目总数 */
  totalProjects: number;
  /** 本轮各来源抓到的条目总数 */
  currentRoundItems: number;
  /** 数据源总数 */
  sources: number;
  /** 本轮成功的来源数 */
  okSources: number;
}

export type CoverageLevel = 'aligned' | 'historical' | 'warning' | 'source_error' | 'unknown';

export interface CoverageGap {
  /** 库内比本轮多出的条目数（负数表示本轮条目反而更多，属正常，取绝对值说明） */
  gap: number;
  /** 状态档位 */
  level: CoverageLevel;
  /** 可直接展示给用户的中文说明 */
  message: string;
}

export function computeCoverageGap(input: CoverageGapInput): CoverageGap {
  const { totalProjects, currentRoundItems, sources, okSources } = input;

  if (sources === 0 || (totalProjects === 0 && currentRoundItems === 0)) {
    return { gap: 0, level: 'unknown', message: '暂无数据源信息' };
  }

  const failed = sources - okSources;
  if (failed > 0) {
    return {
      gap: Math.max(0, totalProjects - currentRoundItems),
      level: 'source_error',
      message: `${failed}/${sources} 个数据源本轮抓取失败，库内数据为最近一次成功抓取的留存`,
    };
  }

  const gap = totalProjects - currentRoundItems;
  if (gap <= 0) {
    return {
      gap: 0,
      level: 'aligned',
      message: `库内 ${totalProjects} 条项目，本轮来源覆盖 ${currentRoundItems} 条线索，口径一致`,
    };
  }

  // 差异过半：可能是来源大幅缩水，需要用户知道
  if (currentRoundItems > 0 && gap / totalProjects > 0.5) {
    return {
      gap,
      level: 'warning',
      message: `库内 ${totalProjects} 条，本轮仅覆盖 ${currentRoundItems} 条 —— 差异较大，可能有来源缩减收录范围`,
    };
  }

  return {
    gap,
    level: 'historical',
    message: `库内 ${totalProjects} 条，本轮来源覆盖 ${currentRoundItems} 条线索；其余 ${gap} 条为历史留存（来源本轮未再收录，未清除以保证数据不丢失）`,
  };
}
