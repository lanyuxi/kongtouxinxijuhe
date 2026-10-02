/**
 * 数据总览磁贴联动筛选的单元测试。
 *
 * 为什么必须锁住这里：
 *   磁贴上的数字是「统计」，点击后的列表是「筛选」，
 *   两者一旦口径不一致，用户看到的就是「写着 21，点进去 19 条」。
 *   这类不一致不会报错、不会崩，只会慢慢磨掉用户对数据的信任，
 *   因此用测试把「统计口径 == 筛选口径」固化成契约。
 */

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatBar } from '../src/components/StatBar';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';
import {
  filterByOverview,
  filterProjects,
  DEFAULT_FILTERS,
  isHighRisk,
  isHighValue,
  isNewToday,
  utcTodayStart,
  OVERVIEW_LABEL,
} from '../src/lib/filter';

const fetchedAt = '2026-09-15T10:00:00.000Z';

function makeProject(over: Partial<AirdropProject> = {}): AirdropProject {
  const base = toSkeleton({
    slug: 'demo',
    name: 'Demo Protocol',
    tagline: '一个测试项目',
    status: 'potential',
    categoryText: 'DeFi',
    chains: ['Ethereum'],
    sourceType: 'airdrop_aggregator',
    sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo/',
    officialUrl: 'https://demo.xyz',
    fetchedAt,
    rawTitle: 'Demo Protocol',
  });
  return { ...base, ...over };
}

/** 便于构造不同评分 / 发现时间的项目 */
function withScores(grade: AirdropProject['scores']['grade'], risk: AirdropProject['scores']['risk']) {
  return (over: Partial<AirdropProject> = {}) =>
    makeProject({ ...over, scores: { ...makeProject().scores, grade, risk } });
}

const highValueLow = withScores('S', 'low');
const highValueMedium = withScores('A', 'medium');
const lowValueHigh = withScores('B', 'high');
const lowValueCritical = withScores('C', 'critical');
const midValueMid = withScores('B', 'medium');

describe('总览口径与筛选口径一致', () => {
  const projects = [
    highValueLow(),
    highValueMedium(),
    lowValueHigh(),
    lowValueCritical(),
    midValueMid(),
  ];
  const total = projects.length;
  const highValue = projects.filter(isHighValue).length;
  const highRisk = projects.filter(isHighRisk).length;

  it('项目总数：不过滤，返回全部', () => {
    expect(filterByOverview(projects, 'total')).toHaveLength(total);
  });

  it('值得关注：只保留 S / A，且条数与统计一致', () => {
    const got = filterByOverview(projects, 'highValue');
    expect(got).toHaveLength(highValue);
    expect(got.every((p) => p.scores.grade === 'S' || p.scores.grade === 'A')).toBe(true);
  });

  it('高风险：只保留 high / critical，且条数与统计一致', () => {
    const got = filterByOverview(projects, 'highRisk');
    expect(got).toHaveLength(highRisk);
    expect(got.every((p) => p.scores.risk === 'high' || p.scores.risk === 'critical')).toBe(true);
  });

  it('值得关注与高风险互不覆盖：S 级高风险项目两个口径都能命中', () => {
    const s = withScores('S', 'critical')({ slug: 's-critical' });
    expect(filterByOverview([s], 'highValue')).toHaveLength(1);
    expect(filterByOverview([s], 'highRisk')).toHaveLength(1);
  });

  it('口径为 null 时不做任何过滤', () => {
    expect(filterByOverview(projects, null)).toHaveLength(total);
  });

  it('四个口径都有中文标签', () => {
    expect(Object.keys(OVERVIEW_LABEL).sort()).toEqual(
      ['highRisk', 'highValue', 'newToday', 'total'].sort(),
    );
    expect(Object.values(OVERVIEW_LABEL).every((v) => v.length > 0)).toBe(true);
  });

  it('项目总数入口包含已结束条目，普通列表仍默认隐藏它们', () => {
    const ended = makeProject({ slug: 'ended', status: 'ended' });
    const all = [...projects, ended];
    expect(filterProjects(filterByOverview(all, 'total'), DEFAULT_FILTERS, { includeEnded: true })).toHaveLength(all.length);
    expect(filterProjects(all, DEFAULT_FILTERS)).toHaveLength(projects.length);
  });

  it('总数入口也允许继续按用户指定的状态筛选', () => {
    const ended = makeProject({ slug: 'ended', status: 'ended' });
    expect(filterProjects([...projects, ended], { ...DEFAULT_FILTERS, status: 'ended' }, { includeEnded: true })).toEqual([ended]);
  });
});

describe('今日新增口径', () => {
  const now = new Date('2026-09-15T08:30:00.000Z');

  it('按 UTC 零点切分，而不是本地零点', () => {
    expect(utcTodayStart(now)).toBe(new Date('2026-09-15T00:00:00.000Z').getTime());
  });

  it('当天 00:00 之后发现的计入，之前的不计入', () => {
    const today = makeProject({ slug: 'today', discovered_at: '2026-09-15T00:00:00.000Z' });
    const yesterday = makeProject({ slug: 'yesterday', discovered_at: '2026-09-14T23:59:59.000Z' });
    expect(isNewToday(today, now)).toBe(true);
    expect(isNewToday(yesterday, now)).toBe(false);
    const got = filterByOverview([today, yesterday], 'newToday', now);
    expect(got.map((p) => p.slug)).toEqual(['today']);
  });

  it('今日新收录磁贴与点击结果都不计入今日收录的已结束项目', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const today = makeProject({ slug: 'today', first_seen_at: now.toISOString() });
      const ended = makeProject({ slug: 'ended', status: 'ended', first_seen_at: now.toISOString() });
      const items = [today, ended];
      const html = renderToStaticMarkup(createElement(StatBar, { projects: items, updatedAt: now.toISOString(), lastDiscovery: now.toISOString() }));
      expect(html).toMatch(/今日新收录<\/p><p class="stat-tile__value">1<\/p>/);
      expect(filterProjects(filterByOverview(items, 'newToday', now), DEFAULT_FILTERS)).toEqual([today]);
    } finally { vi.useRealTimers(); }
  });
});
