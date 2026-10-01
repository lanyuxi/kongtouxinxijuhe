import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { XUpdates } from '../src/components/XUpdates';
import { selectProjectUpdates } from '../src/lib/x-api';
import type { XResult } from '../src/lib/x-api-types';
const result: XResult = { task: null, lastSuccessAt: '2026-10-01T00:00:00Z', accounts: [{ handle: 'demo', slugs: ['demo-a', 'demo-b'], checkedAt: '2026-09-22T00:00:00Z', stale: true, posts: [{ id: '123', text: 'Airdrop <script>alert(1)</script>', url: 'https://x.com/demo/status/123', publishedAt: null, airdropSignal: true }] }] };
describe('个人 X 动态展示', () => {
  it('matches_posts_to_all_slugs_for_shared_account', () => {
    expect(selectProjectUpdates(result, 'demo-b')[0].handle).toBe('demo');
    expect(selectProjectUpdates(result, 'unknown')).toEqual([]);
  });
  it('keeps_stale_time_and_does_not_change_public_status', () => {
    const previous = structuredClone(result); const project = { slug: 'demo-a', status: 'potential', updated_at: 'old-public-time' };
    const html = renderToStaticMarkup(createElement(XUpdates, { result, slug: project.slug }));
    expect(html).toContain('本轮未更新'); expect(result).toEqual(previous);
    expect(project.status).toBe('potential'); expect(project.updated_at).toBe('old-public-time');
  });
  it('empty_and_no_signal_are_distinct', () => {
    const empty = { ...result, accounts: [{ ...result.accounts[0], stale: false, posts: [] }] };
    expect(renderToStaticMarkup(createElement(XUpdates, { result: empty }))).toContain('暂无近期可读推文');
    const noSignal = { ...result, accounts: [{ ...result.accounts[0], stale: false, posts: [{ ...result.accounts[0].posts[0], airdropSignal: false }] }] };
    expect(renderToStaticMarkup(createElement(XUpdates, { result: noSignal }))).toContain('未命中空投关键词');
  });
  it('filters_to_project_and_preserves_escaped_original_text', () => {
    const html = renderToStaticMarkup(createElement(XUpdates, { result, slug: 'demo-a' }));
    expect(html).toContain('推文原文'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>');
  });
});
