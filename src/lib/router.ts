/**
 * 轻量 hash 路由。
 * 对应方案文档：不做复杂多层菜单，不引入路由依赖，保持「零服务器、纯静态」。
 */

import { useEffect, useState } from 'react';
import type { NavKey } from '../components/Layout';

export type Route =
  | { kind: 'list'; view: NavKey }
  | { kind: 'detail'; slug: string };

const NAV_SET = new Set<NavKey>(['latest', 'hot', 'potential', 'claim', 'watchlist']);

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').replace(/\/$/, '');
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
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '#/latest';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}
