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
