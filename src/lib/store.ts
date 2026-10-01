/**
 * 本地收藏与任务进度（LocalStorage）。
 *
 * 对应方案文档第 26 章：
 * - 第一版接受「清缓存丢失、不跨设备同步」的限制
 * - 不为跨设备同步引入账户系统和数据库
 */

import { useCallback, useRef, useState } from 'react';
import type { ListProject } from './types';

const KEY = 'dropscope.local.v1';

export type ProgressStatus = 'none' | 'saved' | 'preparing' | 'doing' | 'done';

export interface ProjectProgress {
  status: ProgressStatus;
  completed_steps: number[];
  completed_step_ids?: string[];
  guide_version?: string;
  needs_review?: boolean;
}

export interface LocalState {
  favorites: string[];
  progress: Record<string, ProjectProgress>;
}

const EMPTY: LocalState = { favorites: [], progress: {} };

export function serializeBackup(state: LocalState): string {
  const progress = Object.fromEntries(state.favorites.filter(slug => state.progress[slug]).map(slug =>
    [slug, resolveProgress(slug, state.favorites, state.progress)]));
  return JSON.stringify({ version: 1, state: { favorites: state.favorites, progress } }, null, 2);
}

/** 整份验证后才导入；只接受本站的收藏与进度字段。 */
export function parseBackup(text: string): LocalState {
  if (text.length > 1_000_000) throw new Error('备份超过 1 MB，请选择本站导出的文件。');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('备份不是有效的 JSON 文件。'); }
  const s = parsed?.state;
  const slug = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,100}$/i.test(v);
  if (parsed?.version !== 1 || !s || !Array.isArray(s.favorites) || s.favorites.length > 1000 ||
      !s.favorites.every(slug) || !s.progress || typeof s.progress !== 'object' || Array.isArray(s.progress)) {
    throw new Error('备份格式或版本不支持，未修改现有收藏。');
  }
  const progress: Record<string, ProjectProgress> = {};
  for (const [key, value] of Object.entries(s.progress)) {
    const p = value as ProjectProgress;
    if (!slug(key) || !s.favorites.includes(key) || !p || !['saved','preparing','doing','done'].includes(p.status) ||
        !Array.isArray(p.completed_steps) || p.completed_steps.length > 200 || !p.completed_steps.every(n => Number.isInteger(n) && n > 0 && n <= 200) ||
        (p.guide_version !== undefined && (typeof p.guide_version !== 'string' || !/^[a-f0-9]{64}$/.test(p.guide_version))) ||
        (p.completed_step_ids !== undefined && (!Array.isArray(p.completed_step_ids) || p.completed_step_ids.length > 200 || !p.completed_step_ids.every(id => typeof id === 'string' && /^[a-f0-9]{64}(?::\d+)?$/.test(id)))) ||
        (p.needs_review !== undefined && typeof p.needs_review !== 'boolean')) {
      throw new Error('备份中的进度记录无效，未修改现有收藏。');
    }
    progress[key] = { status: p.status, completed_steps: [...new Set(p.completed_steps)],
      ...(p.guide_version ? { guide_version: p.guide_version } : {}),
      ...(p.completed_step_ids ? { completed_step_ids: [...new Set(p.completed_step_ids)] } : {}),
      ...(p.needs_review !== undefined ? { needs_review: p.needs_review } : {}) };
  }
  return { favorites: [...new Set<string>(s.favorites)], progress };
}

export function mergeBackup(local: LocalState, incoming: LocalState): LocalState {
  return { favorites: [...new Set([...local.favorites, ...incoming.favorites])], progress: { ...incoming.progress, ...local.progress } };
}

/** 版本改变只继承可识别的步骤，不让旧序号误对应到新动作。 */
export function resolveGuideProgress(project: Pick<ListProject, 'guide' | 'guide_version'>, p: ProjectProgress | undefined): ProjectProgress | undefined {
  if (!p || !project.guide_version || p.guide_version === project.guide_version) return p;
  if (!p.guide_version && !p.completed_steps.length && p.status !== 'done') return p;
  const ids = p.completed_step_ids ?? [];
  return { ...p, status: p.status === 'done' ? 'doing' : p.status,
    completed_steps: project.guide.filter(g => g.id && !g.id.includes(':') && ids.includes(g.id)).map(g => g.step), needs_review: true };
}

function bindGuide(p: ProjectProgress, project: Pick<ListProject, 'guide' | 'guide_version'>): ProjectProgress {
  return { ...p, guide_version: project.guide_version,
    completed_step_ids: project.guide.filter(g => p.completed_steps.includes(g.step) && g.id).map(g => g.id!), needs_review: p.needs_review ?? false };
}

export const PROGRESS_LABEL: Record<ProgressStatus, string> = {
  none: '未收藏',
  saved: '已收藏',
  preparing: '准备参与',
  doing: '进行中',
  done: '已完成',
};

/** 新建项目在用户设置之前的初始进度（唯一来源，禁止在 UI 里另写兜底值） */
export const INITIAL_PROGRESS: ProjectProgress = { status: 'saved', completed_steps: [] };

/**
 * 解析某个项目的进度用于展示。
 *
 * 为什么必须有这个函数（BUG 记录）：
 *   详情页、我的关注漏斗、今日待办三处原先各自写
 *   `progress[slug]?.status ?? 'saved'`，而 `saved` 的中文是「已收藏」。
 *   于是**没收藏过的项目**在详情页「我的参与进度」里显示成「已收藏」，
 *   与它左边那颗「☆ 收藏」按钮（未收藏态）自相矛盾 ——
 *   用户明确没点收藏，却被系统告知已收藏。
 *
 * 判定规则（顺序不可调换，以收藏集合为准）：
 *   - 没有收藏记录      → undefined，由 UI 显示「未收藏 / 先收藏后可记录进度」；
 *   - 有收藏、进度为 none（旧版本写的脏数据）→ 回落成「已收藏」并丢弃残留勾选，
 *     避免旧数据把漏斗统计灌进一个不该存在的分档；
 *   - 老数据没有 progress 字段 → 视作刚收藏。
 */
export function resolveProgress(
  slug: string,
  favorites: readonly string[],
  progress: Record<string, ProjectProgress | undefined>,
): ProjectProgress | undefined {
  if (!favorites.includes(slug)) return undefined;
  const cur = progress[slug];
  if (!cur || cur.status === 'none') return INITIAL_PROGRESS;
  return cur;
}

function load(): LocalState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      progress: parsed.progress ?? {},
    };
  } catch {
    return EMPTY;
  }
}

function persist(state: LocalState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}

export function useLocalState() {
  const [state, setState] = useState<LocalState>(load);
  const stateRef = useRef(state);

  const update = useCallback((fn: (prev: LocalState) => LocalState) => {
    const next = fn(stateRef.current);
    persist(next);
    stateRef.current = next;
    setState(next);
  }, []);

  const toggleFavorite = useCallback(
    (slug: string) => {
      update((prev) => {
        const has = prev.favorites.includes(slug);
        const favorites = has
          ? prev.favorites.filter((s) => s !== slug)
          : [...prev.favorites, slug];
        const progress = { ...prev.progress };
        if (has) {
          delete progress[slug];
        } else {
          progress[slug] = progress[slug] ?? { status: 'saved', completed_steps: [] };
        }
        return { favorites, progress };
      });
    },
    [update],
  );

  const setProgress = useCallback(
    (slug: string, status: ProgressStatus, project?: ListProject) => {
      update((prev) => {
        if (!prev.favorites.includes(slug)) return prev;
        const current = project ? resolveGuideProgress(project, prev.progress[slug]) : prev.progress[slug];
        const next = { ...current, status: status === 'done' && current?.needs_review ? 'doing' as const : status, completed_steps: current?.completed_steps ?? [] };
        return ({
        ...prev,
        progress: {
          ...prev.progress,
          [slug]: project ? bindGuide(next, project) : next,
        },
      }); });
    },
    [update],
  );

  const toggleStep = useCallback(
    (slug: string, step: number, project?: ListProject) => {
      update((prev) => {
        const has = prev.favorites.includes(slug);
        const cur = project ? resolveGuideProgress(project, prev.progress[slug]) : prev.progress[slug];
        // 勾选步骤不改变「是否收藏」这件事：
        //   - 没收藏就没有进度可改，直接忽略（曾被默认值伪造成「已收藏 + 进行中」）；
        //   - 已收藏但还没设过进度，勾第一步等价于用户主动开始 → 记「进行中」。
        if (!has) return prev;
        const status: ProgressStatus = cur?.status === 'saved' || !cur ? 'doing' : cur.status;
        const steps = cur?.completed_steps ?? [];
        const done = steps.includes(step);
        const completed_steps = done
          ? steps.filter((s) => s !== step)
          : [...steps, step].sort((a, b) => a - b);
        return {
          ...prev,
          progress: { ...prev.progress, [slug]: project ? bindGuide({ ...cur, status, completed_steps }, project) : { status, completed_steps } },
        };
      });
    },
    [update],
  );

  const clearAll = useCallback(() => {
    update(() => EMPTY);
  }, [update]);

  const importBackup = useCallback((text: string) => {
    const incoming = parseBackup(text);
    const next = mergeBackup(stateRef.current, incoming);
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { throw new Error('本地存储写入失败，未导入。请先导出已有记录并检查浏览器存储权限。'); }
    stateRef.current = next;
    setState(next);
    return incoming.favorites.length;
  }, []);

  const reconcileGuides = useCallback((projects: ListProject[]) => {
    update(prev => {
      const progress = { ...prev.progress };
      for (const p of projects) if (prev.favorites.includes(p.slug) && prev.progress[p.slug]) {
        progress[p.slug] = resolveGuideProgress(p, prev.progress[p.slug])!;
      }
      return JSON.stringify(progress) === JSON.stringify(prev.progress) ? prev : { ...prev, progress };
    });
  }, [update]);

  const reviewGuide = useCallback((slug: string, project: ListProject) => {
    update(prev => prev.favorites.includes(slug) ? { ...prev, progress: { ...prev.progress,
      [slug]: bindGuide({ ...(resolveGuideProgress(project, prev.progress[slug]) ?? INITIAL_PROGRESS), needs_review: false }, project) } } : prev);
  }, [update]);

  return { state, toggleFavorite, setProgress, toggleStep, clearAll, importBackup, reconcileGuides, reviewGuide };
}

/**
 * 筛选条件的本地持久化。
 *
 * 为什么需要（第一性原理：用户回访时不想重做同一件事）：
 *   旧实现把筛选条件放在 ListView 的 useState 里，于是
 *   「筛出 Solana + 免费 + 新手友好」→ 点进一个项目详情 → 返回，
 *   筛选条件**全部重置**，用户必须重新点一遍。
 *   对一个「每天回来看新空投」的产品，这是每天都要重复的摩擦。
 *
 * 设计取舍：
 *   - 与收藏共用同一套 LocalStorage 约定（清缓存会丢，可接受）；
 *   - **不持久化排序以外的临时态**（例如总览磁贴口径），
 *     因为口径是一次性探索动作，持久化会让用户下次看到一个「莫名少了很多」的列表；
 *   - 读取失败的键一律回落到默认值，避免旧版本/脏数据把筛选器卡死。
 */
const FILTER_KEY = 'dropscope.filters.v1';

/** 仅保留「用户主动设定过、且值得记住」的字段，其余交由默认值兜底 */
export function loadFilters<T extends object>(defaults: T): T {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as Partial<T>;
    if (!saved || typeof saved !== 'object') return defaults;
    // 以 defaults 为白名单合并：只接受两边都存在的键，
    // 防止历史遗留字段或恶意构造的键污染筛选状态。
    const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
    for (const k of Object.keys(defaults)) {
      const v = (saved as Record<string, unknown>)[k];
      if (v !== undefined && v !== null) out[k] = v;
    }
    return out as T;
  } catch {
    return defaults;
  }
}

export function persistFilters(filters: object): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}
