/**
 * 今日待办面板（我的关注页顶部）。
 *
 * 解决的问题：收藏之后没有下文。
 * 竞品普遍有「我的任务 / 今日待办」，因为「下次打开要看什么」是留存的唯一钩子。
 *
 * 三条设计底线：
 *   1. **不制造假紧迫感**：数据里没有可信的「领取截止时间」字段，
 *      因此文案是「已开放领取，窗口关闭后无法补领」，而不是编一个「今天到期」；
 *   2. **没有待办时不显示空壳**：宁可不渲染，也不要一个写着「暂无待办」的框
 *      （那只会让用户觉得这个功能是坏的）；
 *   3. **每条都能一键点过去**：待办的终点一定是具体项目详情页，不做中间页。
 */

import { useMemo } from 'react';
import type { AirdropProject } from '../lib/types';
import type { ProjectProgress } from '../lib/store';
import { TODO_LEVEL_LABEL, buildTodos } from '../lib/todos';

const LEVEL_STYLE: Record<string, string> = {
  p0: 'border-danger/40 bg-danger-wash text-danger',
  p1: 'border-brand/30 bg-brand-wash text-brand',
  p2: 'border-warn/40 bg-warn-wash text-warn',
  p3: 'border-line bg-page text-ink-soft',
};

export function TodayTodos({
  projects,
  favorites,
  progress,
}: {
  projects: AirdropProject[];
  favorites: string[];
  progress: Record<string, ProjectProgress>;
}) {
  const todos = useMemo(
    () => buildTodos(projects, favorites, progress),
    [projects, favorites, progress],
  );

  // 没有可执行的待办就不渲染：空面板比没有面板更让人困惑
  if (todos.length === 0) return null;

  return (
    <section className="panel" aria-labelledby="today-todos-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="today-todos-title" className="panel-title">
          今日待办
        </h2>
        <p className="text-sm text-ink-faint">
          共 {todos.length} 条，按建议处理顺序排列；只根据你本地的收藏与进度生成
        </p>
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {todos.map((t) => (
          <li key={`${t.level}-${t.slug}`}>
            <a
              href={t.href}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line-soft bg-white px-5 py-4 no-underline transition duration-200 hover:-translate-y-px hover:border-brand/30 hover:bg-brand-50"
            >
              <span className={`chip shrink-0 ${LEVEL_STYLE[t.level]}`}>
                {TODO_LEVEL_LABEL[t.level]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-ink">{t.title}</span>
                <span className="mt-1 block text-sm text-ink-soft">{t.reason}</span>
              </span>
              {t.progress && (
                <span className="metric shrink-0 text-xs text-ink-faint">{t.progress}</span>
              )}
              <span aria-hidden className="shrink-0 text-line">›</span>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-ink-faint">
        待办完全由浏览器本地数据生成，不上传任何信息；换设备或清理缓存后会重新开始。
      </p>
    </section>
  );
}
