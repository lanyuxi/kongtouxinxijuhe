/**
 * 今日待办：把「收藏了就没下文」变成「今天该做什么」。
 *
 * 为什么需要它（第一性原理）：
 *   现在「我的关注」页只做两件事：统计四个进度状态的数量、把收藏的项目再列一遍。
 *   用户收藏完就断了线 —— 没有任何东西告诉他「今天该动哪一步」。
 *   而空投这件事恰恰是**有时效性**的：
 *     · 已开放领取的活动有截止时间，错过就没了；
 *     · 教程勾了一半的项目，放着放着就忘了；
 *     · 新出现的高价值项目，需要尽快判断要不要参与。
 *   竞品普遍有「我的任务 / 今日待办」，因为这是留存的关键动作。
 *
 * 设计约束（重要）：
 *   1. **只从本地已有信息推导**，不引入任何新数据字段、不请求任何接口
 *      （本站零服务端，且不该为了一个待办列表去改数据契约）；
 *   2. **不编造截止日期**：数据里没有「领取截止时间」这个可信字段，
 *      因此这里不用「今天到期」这种措辞，而是说「已开放领取，请尽快核对资格」；
 *   3. **只给动作，不给收益承诺**；每条都带一个能直接点过去的链接。
 *
 * 优先级（从上到下即建议处理顺序）：
 *   P0 领取窗口可能关闭 → 已开放领取且还没做完
 *   P1 高价值未开始     → 价值等级 S/A 且进度还是「已收藏」
 *   P2 做了一半         → 教程有勾选但未标记完成
 *   P3 风险需要复核     → 高风险且仍在关注列表里
 */

import type { ListProject } from './types';
import type { ProgressStatus, ProjectProgress } from './store';

export type TodoLevel = 'p0' | 'p1' | 'p2' | 'p3';

export interface TodoItem {
  level: TodoLevel;
  /** 待办标题（一句话说清做什么） */
  title: string;
  /** 为什么是今天（简短理由，不制造焦虑） */
  reason: string;
  slug: string;
  /** 直达链接（项目详情页） */
  href: string;
  /** 步骤进度文案，例如「已完成 2 / 5 步」 */
  progress?: string;
}

export const TODO_LEVEL_LABEL: Record<TodoLevel, string> = {
  p0: '尽快处理',
  p1: '值得先看',
  p2: '继续完成',
  p3: '需要复核',
};

const LEVEL_ORDER: Record<TodoLevel, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

/** 单个项目的待办（最多产出一条，避免同一项目刷屏） */
function todoOf(p: ListProject, progress: ProjectProgress | undefined): TodoItem | null {
  const status: ProgressStatus = progress?.status ?? 'saved';
  const doneSteps = progress?.completed_steps?.length ?? 0;
  const totalSteps = p.guide.length;
  const progressText =
    totalSteps > 0 ? `已完成 ${doneSteps} / ${totalSteps} 步` : undefined;

  // P0：已开放领取，但本地进度还没完成 —— 领取窗口是最容易错过的时效性动作
  if (p.status === 'claim_live' && status !== 'done') {
    return {
      level: 'p0',
      title: `核对 ${p.name} 的领取资格`,
      reason: '该项目已开放领取，窗口关闭后无法补领。',
      slug: p.slug,
      href: `#/project/${p.slug}`,
      progress: progressText,
    };
  }

  // P1：高价值但还没开始动手
  const highValue = p.scores.grade === 'S' || p.scores.grade === 'A';
  if (highValue && status === 'saved') {
    return {
      level: 'p1',
      title: `决定是否参与 ${p.name}`,
      reason: `价值等级 ${p.scores.grade}，目前还停留在「已收藏」。`,
      slug: p.slug,
      href: `#/project/${p.slug}`,
      progress: progressText,
    };
  }

  // P2：教程勾了一半 —— 断在半路是最容易被遗忘的状态
  if (doneSteps > 0 && status !== 'done') {
    return {
      level: 'p2',
      title: `继续完成 ${p.name} 的剩余步骤`,
      reason: '教程已经勾了一部分，放着容易忘。',
      slug: p.slug,
      href: `#/project/${p.slug}`,
      progress: progressText,
    };
  }

  // P3：高风险仍在关注列表里，需要复核后再决定是否继续
  if (p.scores.risk === 'high' || p.scores.risk === 'critical') {
    return {
      level: 'p3',
      title: `复核 ${p.name} 的风险说明`,
      reason: '该项目风险等级偏高，建议先读清风险再决定是否继续。',
      slug: p.slug,
      href: `#/project/${p.slug}`,
      progress: progressText,
    };
  }

  // 已收藏但还没有可执行动作（例如低价值潜在项目）：不制造无意义的待办
  return null;
}

/**
 * 生成今日待办列表。
 * @param projects 全量项目（只在收藏集合内取）
 * @param favorites 收藏的 slug
 * @param progress 本地进度
 * @param limit 最多返回条数（默认 6，避免把关注页压垮）
 */
export function buildTodos(
  projects: ListProject[],
  favorites: string[],
  progress: Record<string, ProjectProgress>,
  limit = 6,
): TodoItem[] {
  const favSet = new Set(favorites);
  const items: TodoItem[] = [];
  for (const p of projects) {
    if (!favSet.has(p.slug)) continue;
    const item = todoOf(p, progress[p.slug]);
    if (item) items.push(item);
  }
  items.sort((a, b) => {
    const d = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (d !== 0) return d;
    return a.slug.localeCompare(b.slug, 'en');
  });
  return items.slice(0, limit);
}
