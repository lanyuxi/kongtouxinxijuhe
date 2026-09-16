/**
 * P2-2｜数据透明度：把「库内数据」与「本轮来源」的差异摊开给用户。
 *
 * 实测问题（上轮审查 P2-2）：
 *   ```
 *   data/source-health.json：2/2 来源正常
 *   data/live/defillama.json：120 条，0 条命中代码里的 EXCLUDE_PATTERNS
 *   → 说明「本轮抓取」与「库内留存」是两批不同的数据
 *   ```
 *   定时任务每轮都显示「全部来源正常」，但库里还躺着 20 个
 *   当前代码根本抓不到、且本该被排除的条目（修复前）。
 *   前端 `SourceHealthBanner` 只看 `ok` 字段，
 *   **无法表达「库内数据与当前口径不一致」**。
 *
 * 修复：新增覆盖率对比计算 —— 把「库内 N 条」与「本轮来源覆盖 M 条」显式暴露，
 * 差异过大时给出可解释的提示，而不是让用户以为「2/2 正常」就等于
 * 「库里的每一条都是本轮抓到的」。
 */
import { describe, it, expect } from 'vitest';
import { computeCoverageGap } from '../src/lib/coverage';

describe('P2-2 库内 vs 本轮覆盖率对比', () => {
  it('完全覆盖时无差异', () => {
    const r = computeCoverageGap({ totalProjects: 100, currentRoundItems: 100, sources: 2, okSources: 2 });
    expect(r.gap).toBe(0);
    expect(r.level).toBe('aligned');
    expect(r.message).toContain('100');
  });

  it('库内多于本轮时给出「历史留存」解释', () => {
    const r = computeCoverageGap({ totalProjects: 202, currentRoundItems: 178, sources: 2, okSources: 2 });
    expect(r.gap).toBe(24);
    expect(r.level).toBe('historical');
    expect(r.message).toContain('历史');
  });

  it('差异过大时升级为警示', () => {
    const r = computeCoverageGap({ totalProjects: 400, currentRoundItems: 100, sources: 2, okSources: 2 });
    expect(r.level).toBe('warning');
  });

  it('来源不健康时优先提示来源问题，而不是覆盖率', () => {
    const r = computeCoverageGap({ totalProjects: 200, currentRoundItems: 60, sources: 3, okSources: 1 });
    expect(r.level).toBe('source_error');
    expect(r.message).toContain('失败');
  });

  it('无数据时不抛错', () => {
    const r = computeCoverageGap({ totalProjects: 0, currentRoundItems: 0, sources: 0, okSources: 0 });
    expect(r.message.length).toBeGreaterThan(0);
  });
});
