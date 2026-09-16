/**
 * 本地收藏与任务进度（LocalStorage）。
 *
 * 对应方案文档第 26 章：
 * - 第一版接受「清缓存丢失、不跨设备同步」的限制
 * - 不为跨设备同步引入账户系统和数据库
 */

import { useCallback, useEffect, useState } from 'react';

const KEY = 'dropscope.local.v1';

export type ProgressStatus = 'none' | 'saved' | 'preparing' | 'doing' | 'done';

export interface ProjectProgress {
  status: ProgressStatus;
  completed_steps: number[];
}

export interface LocalState {
  favorites: string[];
  progress: Record<string, ProjectProgress>;
}

const EMPTY: LocalState = { favorites: [], progress: {} };

export const PROGRESS_LABEL: Record<ProgressStatus, string> = {
  none: '未收藏',
  saved: '已收藏',
  preparing: '准备参与',
  doing: '进行中',
  done: '已完成',
};

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
  const [state, setState] = useState<LocalState>(EMPTY);

  useEffect(() => {
    setState(load());
  }, []);

  const update = useCallback((fn: (prev: LocalState) => LocalState) => {
    setState((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
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
    (slug: string, status: ProgressStatus) => {
      update((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          [slug]: {
            status,
            completed_steps: prev.progress[slug]?.completed_steps ?? [],
          },
        },
      }));
    },
    [update],
  );

  const toggleStep = useCallback(
    (slug: string, step: number) => {
      update((prev) => {
        const cur = prev.progress[slug] ?? { status: 'doing' as ProgressStatus, completed_steps: [] };
        const has = cur.completed_steps.includes(step);
        const completed_steps = has
          ? cur.completed_steps.filter((s) => s !== step)
          : [...cur.completed_steps, step].sort((a, b) => a - b);
        return {
          ...prev,
          progress: { ...prev.progress, [slug]: { status: cur.status, completed_steps } },
        };
      });
    },
    [update],
  );

  const clearAll = useCallback(() => {
    update(() => EMPTY);
  }, [update]);

  return { state, toggleFavorite, setProgress, toggleStep, clearAll };
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
