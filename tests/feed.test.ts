/**
 * Atom feed 的单元测试。
 *
 * feed 是「用户订阅后会长期看」的东西，出错方式非常隐蔽：
 * XML 转义漏一个字符，阅读器会静默解析失败（不是报错，而是什么都不显示），
 * 而浏览器打开文件时**看起来是正常的**。因此转义与日期格式必须锁死。
 */

import { describe, it, expect } from 'vitest';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';
import {
  DEFAULT_SITE_URL,
  absoluteUrl,
  buildAtomFeed,
  escapeXml,
  feedItemSummary,
  selectFeedProjects,
  toRfc3339,
} from '../scripts/lib/feed';
import { resolveSiteUrl } from '../scripts/build-feed';

/**
 * 测试用的「当前时间」必须显式传给被测函数。
 * 若用真实 Date.now()，「最近 14 天」的窗口会随开发/CI 的运行日期漂移，
 * 今天通过的用例过几天就会变绿或变红 —— 这种假失败比不写测试更糟。
 */
const now = '2026-09-13T10:00:00.000Z';

function project(over: Partial<AirdropProject> & { slug: string } = { slug: 'demo' }): AirdropProject {
  const base = toSkeleton({
    slug: over.slug,
    name: 'Demo',
    sourceType: 'airdrop_aggregator',
    sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo',
    title: 'Demo',
    url: 'https://airdrops.io/demo',
    fetchedAt: now,
  }) as AirdropProject;
  return {
    ...base,
    ...over,
    scores: { ...base.scores, ...(over.scores ?? {}) } as AirdropProject['scores'],
  };
}

describe('XML 转义', () => {
  it('转义全部 5 个 XML 特殊字符', () => {
    expect(escapeXml('A & B < C > D "E" \'F\'')).toBe(
      'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;',
    );
  });

  it('项目名里带 & 时不会破坏 XML 结构', () => {
    const xml = buildAtomFeed([project({ slug: 'amp', name: 'A&B <Demo>' })], {
      siteUrl: DEFAULT_SITE_URL,
      updatedAt: now,
    });
    expect(xml).toContain('A&amp;B &lt;Demo&gt;');
    // 不允许出现未转义的裸 & （&amp; 之外的 & 都是非法的）
    expect(/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml)).toBe(false);
  });

  it('转义 & 优先，不会把 &lt; 二次转义成 &amp;lt;', () => {
    const xml = buildAtomFeed([project({ slug: 'x', tagline: 'a < b & c' } as never)], {
      siteUrl: DEFAULT_SITE_URL,
      updatedAt: now,
    });
    expect(xml).not.toContain('&amp;lt;');
  });
});

describe('条目挑选', () => {
  const ended = project({ slug: 'ended', status: 'ended' });
  const critical = project({
    slug: 'critical',
    status: 'claim_live',
    scores: { risk: 'critical' } as never,
  });
  // 注意：discovered_at 必须显式设置 —— 骨架默认取 fetchedAt（即「现在」），
  // 不设置的话三个项目都会被判成「最近发现」，测不出窗口过滤。
  const lowC = project({
    slug: 'low-c',
    status: 'potential',
    scores: { grade: 'C' } as never,
    discovered_at: '2026-01-05T00:00:00.000Z',
  });
  const recent = project({
    slug: 'recent',
    status: 'potential',
    scores: { grade: 'C' } as never,
    discovered_at: now,
  });
  const claimLive = project({
    slug: 'claim',
    status: 'claim_live',
    scores: { grade: 'C' } as never,
    discovered_at: '2026-01-01T00:00:00.000Z',
  });

  it('排除已结束与极高风险项目（不做传播，避免误导）', () => {
    const picked = selectFeedProjects([ended, critical, claimLive], {}, Date.parse(now));
    expect(picked.map((p) => p.slug)).toEqual(['claim']);
  });

  it('保留开放领取 / 已确认 / 高价值 / 最近发现的项目', () => {
    const picked = selectFeedProjects([lowC, recent, claimLive], {}, Date.parse(now));
    expect(picked.map((p) => p.slug).sort()).toEqual(['claim', 'recent'].sort());
  });

  it('按发现时间倒序，且数量受限', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      project({
        slug: `p${i}`,
        status: 'claim_live',
        scores: { grade: 'C' } as never,
        discovered_at: new Date(Date.parse(now) - i * 1000).toISOString(),
      }),
    );
    const picked = selectFeedProjects(many, { limit: 10 }, Date.parse(now));
    expect(picked).toHaveLength(10);
    expect(picked[0].slug).toBe('p0');
  });
});

describe('feed 结构', () => {
  const items = [project({ slug: 'demo', name: 'Demo', status: 'claim_live', tagline: '借贷协议：存入资产赚取利息。' })];

  it('是合法 Atom：含必需元素，且条目数正确', () => {
    const xml = buildAtomFeed(items, { siteUrl: DEFAULT_SITE_URL, updatedAt: now });
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    for (const tag of ['<title>', '<id>', '<updated>', '<author>', '<entry>']) {
      expect(xml).toContain(tag);
    }
    expect((xml.match(/<entry>/g) ?? []).length).toBe(1);
    expect((xml.match(/<\/entry>/g) ?? []).length).toBe(1);
  });

  it('日期为 RFC3339 且带时区（Atom 的硬性要求）', () => {
    expect(toRfc3339(now)).toBe(now);
    expect(toRfc3339('不是日期')).toBe('1970-01-01T00:00:00.000Z');
    const xml = buildAtomFeed(items, { siteUrl: DEFAULT_SITE_URL, updatedAt: now });
    expect(xml).toContain(`<updated>${now}</updated>`);
  });

  it('链接是绝对地址（阅读器不保证保留站点上下文）', () => {
    const xml = buildAtomFeed(items, { siteUrl: DEFAULT_SITE_URL, updatedAt: now });
    expect(xml).toContain(`${DEFAULT_SITE_URL}#/project/demo`);
    expect(absoluteUrl('https://a.dev/', 'x')).toBe('https://a.dev/x');
    expect(absoluteUrl('https://a.dev', '/x')).toBe('https://a.dev/x');
  });

  it('条目描述带风险等级与防骗提示，不做收益承诺', () => {
    const text = feedItemSummary(project({ slug: 'd', status: 'confirmed' }), DEFAULT_SITE_URL);
    expect(text).toContain('风险等级');
    expect(text).toContain('不构成投资建议');
    expect(text).toContain('助记词');
    expect(text).not.toMatch(/稳赚|保证收益|必得/);
  });

  it('空数据集不产生非法 XML（不残留空的 entry 标签）', () => {
    const xml = buildAtomFeed([], { siteUrl: DEFAULT_SITE_URL, updatedAt: now });
    expect(xml).not.toContain('<entry>');
    expect(xml).toContain('</feed>');
  });
});

describe('站点地址解析', () => {
  it('SITE_URL 优先，并自动补结尾斜杠', () => {
    expect(resolveSiteUrl({ SITE_URL: 'https://x.dev' } as NodeJS.ProcessEnv)).toBe('https://x.dev/');
    expect(resolveSiteUrl({ SITE_URL: 'https://x.dev/' } as NodeJS.ProcessEnv)).toBe('https://x.dev/');
  });

  it('无 SITE_URL 时从 BASE_PATH 推导（仅当它是绝对地址）', () => {
    expect(resolveSiteUrl({ BASE_PATH: 'https://y.dev/sub/' } as NodeJS.ProcessEnv)).toBe(
      'https://y.dev/sub/',
    );
    // 相对路径拿不到站点地址，必须回退到默认值，绝不能拼出一个假域名
    expect(resolveSiteUrl({ BASE_PATH: './' } as NodeJS.ProcessEnv)).toBe(DEFAULT_SITE_URL);
  });

  it('什么都不配置时回退到默认 Pages 地址', () => {
    expect(resolveSiteUrl({} as NodeJS.ProcessEnv)).toBe(DEFAULT_SITE_URL);
  });
});
