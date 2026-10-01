/**
 * 轻量 hash 路由。
 * 对应方案文档：不做复杂多层菜单，不引入路由依赖，保持「零服务器、纯静态」。
 */

import { useEffect, useState } from 'react';
import type { NavKey } from '../components/Layout';
import type { Filters, OverviewKey } from './filter';

export type Route =
  | { kind: 'list'; view: NavKey }
  | { kind: 'detail'; slug: string }
  | { kind: 'safety' }
  | { kind: 'settings' };

const NAV_SET = new Set<NavKey>(['latest', 'hot', 'potential', 'claim', 'watchlist', 'safety']);

export interface ListContext { filters: Filters; overview: OverviewKey | null; expanded: boolean; sourceExpanded?: boolean; statsExpanded?: boolean; scrollY: number }
const contexts = new Map<NavKey, ListContext>();
let lastListHash = '#/latest';
export const readListContext = (view: NavKey) => contexts.get(view);
export const saveListContext = (view: NavKey, context: ListContext) => { contexts.set(view, context); };
export function listReturnTarget(hash: string): string {
  const route = parseHash(hash);
  return route.kind === 'list' ? `#/${route.view}` : '#/latest';
}
export const detailReturnTarget = () => {
  const saved = typeof window !== 'undefined' ? window.history.state?.airdropReturn : undefined;
  return typeof saved === 'string' ? listReturnTarget(saved) : lastListHash;
};
export const returnToList = () => { window.location.hash = detailReturnTarget(); };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (clean === 'safety') return { kind: 'safety' };
  if (clean === 'settings') return { kind: 'settings' };
  if (clean.startsWith('project/')) {
    const slug = clean.slice('project/'.length);
    if (slug) return { kind: 'detail', slug };
  }
  const key = clean as NavKey;
  if (NAV_SET.has(key)) return { kind: 'list', view: key };
  return { kind: 'list', view: 'latest' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    let previous = window.location.hash;
    const onHash = () => {
      if (parseHash(previous).kind === 'list') lastListHash = listReturnTarget(previous);
      const next = parseHash(window.location.hash);
      if (next.kind === 'detail') {
        const saved = window.history.state?.airdropReturn;
        if (typeof saved === 'string') lastListHash = listReturnTarget(saved);
        else window.history.replaceState({ ...window.history.state, airdropReturn: lastListHash }, '', window.location.href);
      }
      previous = window.location.hash;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '#/latest';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
