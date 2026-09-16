/**
 * 详情页「我的参与进度」默认值 BUG（issue #28）。
 *
 * 实测问题：
 *   用户从未点过「☆ 收藏」，详情页右侧的「我的参与进度」却显示**「已收藏」**，
 *   与左侧那颗仍处于未选中态的「☆ 收藏」按钮直接自相矛盾。
 *
 * 根因（三处各自写默认值）：
 *   ```ts
 *   progress?.status ?? 'saved'      // 详情页
 *   progress[p.slug]?.status ?? 'saved'  // 我的关注漏斗
 *   const status = progress?.status ?? 'saved'  // 今日待办
 *   ```
 *   `saved` 的中文标签就是「已收藏」，于是「本地没有任何记录」被渲染成「已收藏」。
 *
 * 修复原则：
 *   1. **收藏集合是唯一真源**：没在 favorites 里 → 进度必须是 undefined，
 *      UI 显示「未收藏」，而不是任何一个已收藏分档；
 *   2. 默认值只允许有一个来源（`resolveProgress`），UI 层禁止再写 `?? 'saved'`；
 *   3. 未收藏项目不得进入漏斗计数，也不得凭一步步勾选把自己伪造成「进行中」。
 */
import { describe, it, expect } from 'vitest';
import { INITIAL_PROGRESS, PROGRESS_LABEL, resolveProgress } from '../src/lib/store';
import { buildTodos } from '../src/lib/todos';
import type { ListProject } from '../src/lib/types';

describe('issue #28 进度默认值：未收藏不得显示为「已收藏」', () => {
  it('未收藏的项目解析为 undefined，而不是 saved', () => {
    expect(resolveProgress('demo', [], {})).toBeUndefined();
    // 即使进度里残留了该 slug（例如用户先清空收藏、数据未同步），也以收藏集合为准
    expect(
      resolveProgress('demo', [], { demo: { status: 'doing', completed_steps: [1] } }),
    ).toBeUndefined();
  });

  it('未收藏时 UI 的兜底标签是「未收藏」，绝不等于「已收藏」', () => {
    const resolved = resolveProgress('demo', [], {});
    // DetailView 的 select 取值：`progress?.status ?? 'none'`
    const shown = resolved?.status ?? 'none';
    expect(PROGRESS_LABEL[shown]).toBe('未收藏');
    expect(PROGRESS_LABEL[shown]).not.toBe(PROGRESS_LABEL.saved);
  });

  it('已收藏但没有进度记录 → 视为「已收藏」（默认值唯一来源）', () => {
    expect(resolveProgress('demo', ['demo'], {})).toEqual(INITIAL_PROGRESS);
    expect(INITIAL_PROGRESS.status).toBe('saved');
  });

  it('旧版本的脏数据（status: none）回落成「已收藏」且不保留残留勾选', () => {
    const got = resolveProgress('demo', ['demo'], {
      demo: { status: 'none', completed_steps: [1, 2] },
    });
    expect(got).toEqual(INITIAL_PROGRESS);
    expect(got?.completed_steps).toEqual([]);
  });

  it('用户真的设过的进度必须原样保留', () => {
    const p = { status: 'doing' as const, completed_steps: [1] };
    expect(resolveProgress('demo', ['demo'], { demo: p })).toBe(p);
  });

  it('我的关注漏斗：四个分档之和等于已收藏数量，不再被没收藏的项目灌高', () => {
    const favorites = ['a', 'b'];
    const progress = {
      // a 用户设成了 doing；b 没有任何记录；c 没收藏却残留了进度
      a: { status: 'doing' as const, completed_steps: [] },
      c: { status: 'saved' as const, completed_steps: [] },
    };
    const statuses = ['saved', 'preparing', 'doing', 'done'] as const;
    const counts = statuses.map(
      (s) =>
        favorites.filter((slug) => resolveProgress(slug, favorites, progress)?.status === s).length,
    );
    expect(counts.reduce((x, y) => x + y, 0)).toBe(favorites.length);
    expect(counts).toEqual([1, 0, 1, 0]);
  });

  it('今日待办只覆盖真正收藏过的项目', () => {
    const project = (slug: string): ListProject =>
      ({
        slug,
        name: slug,
        status: 'claim_live',
        scores: { grade: 'S', risk: 'low' },
        guide: [],
      }) as unknown as ListProject;
    // favorites 为空，但 progress 里有脏数据：不得产出任何待办
    const todos = buildTodos([project('a')], [], {
      a: { status: 'saved', completed_steps: [] },
    });
    expect(todos).toEqual([]);
  });
});
