/**
 * X（Twitter）信息源接入（issue #28）。
 *
 * 用户诉求：空投第一现场在 X，项目方都会先发推，能不能直接从 X 拿消息。
 *
 * 实测事实（2026-09-16，本仓库 Runner）：
 *   x.com / api.x.com / cdn.syndication.twimg.com  → TLS 层被重置
 *   nitter 各公开实例                              → 已全部失效
 *   rsshub 各公开实例                              → 503（Twitter 路由公开额度已停）
 *   api.x.com 正式 API                            → 需 Bearer Token（付费）
 * 结论：无凭据抓不到推文，这一点必须如实暴露，而不是伪造数据。
 *
 * 因此本测试锁死两件事：
 *   1. **诚实性**：抓不到就报错、就说「未配置凭据」，绝不返回假推文
 *   2. **安全边界**：X 链接识别必须精确到域名 + handle 白名单，
 *      不能把 frax.com 的链接当成 X（历史上真实踩过的坑）
 */
import { describe, it, expect } from 'vitest';
import { handleFromUrl, looksLikeAirdrop, buildHandleIndex } from '../scripts/fetch/twitter';
import { normalizeXUrl, backfillXHandles } from '../scripts/lib/x-handles';
import { adapters } from '../scripts/fetch/index';
import type { AirdropProject } from '../src/lib/types';

/** 构造最小可用的项目对象（只带本测试关心的字段） */
function proj(slug: string, x?: string): AirdropProject {
  return {
    id: slug,
    name: slug,
    slug,
    tagline: '测试项目',
    category: 'DeFi',
    chains: ['Ethereum'],
    status: 'potential',
    official: x ? { x } : {},
    meta: {},
    tasks: [],
    requirements: [],
    sources: [],
    evidence: [],
    scores: {} as AirdropProject['scores'],
    cost: {} as AirdropProject['cost'],
    recommendation: 'watch',
    guide: {} as AirdropProject['guide'],
    guide_source: 'template',
    faq: [],
    risks: [],
    created_at: '2026-01-01T00:00:00.000Z',
    discovered_at: '2026-01-01T00:00:00.000Z',
    last_checked_at: '2026-01-01T00:00:00.000Z',
    last_changed_at: '2026-01-01T00:00:00.000Z',
    sourcedSteps: false,
  } as unknown as AirdropProject;
}

describe('X 账号链接识别（安全边界）', () => {
  it('接受 x.com 与 twitter.com 的账号链接', () => {
    expect(handleFromUrl('https://x.com/aave')).toBe('aave');
    expect(handleFromUrl('https://twitter.com/aave')).toBe('aave');
    expect(handleFromUrl('https://www.x.com/@aave')).toBe('aave');
    expect(handleFromUrl('https://x.com/aave/')).toBe('aave');
  });

  it('绝不把「域名里含 x」的站点误判为 X', () => {
    // 历史上真实踩过的坑：子串包含匹配会误杀
    expect(handleFromUrl('https://frax.com/x')).toBeUndefined();
    expect(handleFromUrl('https://x.com.evil.io/aave')).toBeUndefined();
    expect(handleFromUrl('https://notx.com/aave')).toBeUndefined();
    expect(handleFromUrl('https://example.com/x.com/aave')).toBeUndefined();
  });

  it('排除 X 的保留路径，不把功能页当账号', () => {
    for (const p of ['i', 'home', 'intent', 'share', 'hashtag', 'search', 'explore', 'login']) {
      expect(handleFromUrl(`https://x.com/${p}/something`)).toBeUndefined();
    }
  });

  it('非法 URL 安全返回 undefined，不抛异常', () => {
    expect(handleFromUrl('')).toBeUndefined();
    expect(handleFromUrl('not-a-url')).toBeUndefined();
    expect(handleFromUrl('x.com/aave')).toBeUndefined();
  });

  it('normalizeXUrl 只输出规范化的 x.com 链接', () => {
    expect(normalizeXUrl('https://twitter.com/aave?ref=abc')).toBe('https://x.com/aave');
    // handle 超出 X 的 15 字符上限 → 拒绝
    expect(normalizeXUrl('https://x.com/aaaaaaaaaaaaaaaaaaaa')).toBeUndefined();
    // 非法字符 → 拒绝
    expect(normalizeXUrl('https://x.com/aave-defi')).toBeUndefined();
  });
});

describe('X 空投信号识别（只认强信号词）', () => {
  it('命中真实空投叙事', () => {
    expect(looksLikeAirdrop('Claim is live now')).toBe(true);
    expect(looksLikeAirdrop('TGE announced')).toBe(true);
    expect(looksLikeAirdrop('Airdrop snapshot completed')).toBe(true);
    expect(looksLikeAirdrop('Whitelist registration open')).toBe(true);
    expect(looksLikeAirdrop('空投快照已完成，请领取')).toBe(true);
  });

  it('不把日常推文误判为空投线索（避免噪音刷屏）', () => {
    expect(looksLikeAirdrop('gm frens')).toBe(false);
    expect(looksLikeAirdrop('We are hiring!')).toBe(false);
    expect(looksLikeAirdrop('Mainnet upgrade scheduled')).toBe(false);
  });
});

describe('官方 X 账号索引', () => {
  it('能从人工档案与库内数据汇总出 handle，且无重复', () => {
    const idx = buildHandleIndex();
    expect(idx.length).toBeGreaterThan(0);
    const slugs = idx.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // 每个 handle 都必须合法
    for (const i of idx) {
      expect(i.handle).toMatch(/^[A-Za-z0-9_]{1,15}$/);
    }
  });
});

describe('backfillXHandles 回填行为', () => {
  it('人工档案的 X 能补到没有 X 的项目上', () => {
    const r = backfillXHandles([proj('hyperliquid')], [
      { slug: 'hyperliquid', x: 'https://x.com/HyperliquidX' },
    ]);
    expect(r.filled).toBe(1);
    expect(r.projects[0].official.x).toBe('https://x.com/HyperliquidX');
  });

  it('已有合法 X 时不覆盖（人工档案优先级最高）', () => {
    const r = backfillXHandles([proj('aave', 'https://x.com/aave')], [
      { slug: 'aave', x: 'https://x.com/other' },
    ]);
    expect(r.filled).toBe(0);
    expect(r.projects[0].official.x).toBe('https://x.com/aave');
  });

  it('没有公开 X 账号时留空，绝不按 slug 猜一个', () => {
    const r = backfillXHandles([proj('lightning-network')], []);
    expect(r.filled).toBe(0);
    expect(r.projects[0].official.x).toBeUndefined();
    expect(r.missing).toContain('lightning-network');
  });

  it('非法 X 链接被拒绝并记录，而不是静默写入', () => {
    const r = backfillXHandles([proj('bad', 'https://frax.com/x')], []);
    expect(r.projects[0].official.x).toBeUndefined();
    expect(r.rejected.some((x) => x.slug === 'bad')).toBe(true);
  });

  it('全库跑一遍：没有项目会拿到非 x.com 的 X 链接', () => {
    const airdrops = require('../data/airdrops.json') as {
      projects: { slug: string; official?: { x?: string } }[];
    };
    const projects = airdrops.projects.map((p) => proj(p.slug, p.official?.x));
    const r = backfillXHandles(projects, []);
    for (const p of r.projects) {
      if (p.official.x) expect(p.official.x).toMatch(/^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/);
    }
  });
});

describe('X 数据源接入的诚实性', () => {
  it('适配器已接入流水线', () => {
    expect(adapters.some((a) => a.name === 'X (Twitter)')).toBe(true);
  });

  it('抓不到时必须 throw，不得返回伪造数据', async () => {
    const x = adapters.find((a) => a.name === 'X (Twitter)')!;
    // 本环境（无凭据 + 网络被重置）下必须如实失败；
    // 若某天真的抓到，则返回的每条都必须指向 x.com —— 两者都算通过，但绝不允许假数据。
    try {
      const items = await x.fetch();
      expect(items.length).toBeGreaterThan(0);
      for (const it of items) {
        expect(it.officialProfiles?.x).toMatch(/^https:\/\/x\.com\//);
      }
    } catch (e) {
      expect((e as Error).message).toMatch(/无法访问 X|X_BEARER_TOKEN/);
    }
  }, 120_000);
});

describe('网络熔断：避免一条不可达来源拖垮整轮流水线', () => {
  it('只把网络层错误计入熔断，账号 404 不算（否则会误熔断）', async () => {
    const { isNetworkFailure } = await import('../scripts/fetch/twitter');
    // 网络层错误 → 计入
    expect(isNetworkFailure('fetch failed')).toBe(true);
    expect(isNetworkFailure('抓取失败 ...：The operation was aborted')).toBe(true);
    expect(isNetworkFailure('socket hang up')).toBe(true);
    expect(isNetworkFailure('ECONNRESET')).toBe(true);
    // 业务错误 → 不计入（账号注销是正常结果，不是网络问题）
    expect(isNetworkFailure('HTTP 404')).toBe(false);
    expect(isNetworkFailure('HTTP 403')).toBe(false);
    expect(isNetworkFailure('oembed 未返回作者信息')).toBe(false);
  });

  it('实测：不可达时在有限时间内熔断，而不是跑满 40 个账号的超时', async () => {
    const x = adapters.find((a) => a.name === 'X (Twitter)')!;
    const start = Date.now();
    try {
      await x.fetch();
    } catch {
      /* 预期失败 */
    }
    const elapsed = Date.now() - start;
    // 修复前：40 账号 ÷ 4 并发 × 15s ≈ 150s
    // 熔断后：约 3 个请求 × 15s 内即可判定
    expect(elapsed).toBeLessThan(75_000);
  }, 120_000);
});
