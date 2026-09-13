/**
 * 一句话中文简介 + 同协议归组的单元测试。
 *
 * 归组逻辑直接改变列表展示，一旦出错会让用户看不到项目（比看到重复更严重），
 * 因此重点锁两条：不丢数据、主条目选择稳定可复现。
 */

import { describe, it, expect } from 'vitest';
import type { AirdropProject } from '../src/lib/types';
import { toSkeleton } from '../scripts/lib/merge';
import {
  chineseBlurb,
  flattenGroups,
  groupByProtocol,
  groupKeyOf,
  isAggregatorHost,
  protocolTypeOf,
  taglineSaysConfirmed,
} from '../src/lib/describe';

const now = '2026-09-13T10:00:00.000Z';

function make(over: Partial<AirdropProject> = {}): AirdropProject {
  const base = toSkeleton({
    slug: 'demo',
    name: 'Demo',
    tagline: 'Lending 协议，TVL 约 $17360M。',
    status: 'potential',
    categoryText: 'DeFi',
    chains: ['Ethereum'],
    sourceType: 'airdrop_aggregator',
    sourceName: 'Airdrops.io',
    sourceUrl: 'https://airdrops.io/demo/',
    officialUrl: 'https://demo.xyz',
    fetchedAt: now,
    rawTitle: 'Demo',
  });
  return { ...base, ...over };
}

describe('一句话中文简介', () => {
  it('协议类型映射为中文业务说明，并保留 TVL', () => {
    const b = chineseBlurb(make());
    expect(b).toContain('借贷协议');
    expect(b).toContain('$17.4B');
    expect(b).not.toBe('Lending 协议，TVL 约 $17360M。');
  });

  it('未知协议类型时回退到分类说明', () => {
    const b = chineseBlurb(make({ tagline: 'Some Weird Protocol' }));
    expect(b).toContain('去中心化金融');
  });

  it('英文长句 tagline 也会被替换为中文说明', () => {
    const b = chineseBlurb(
      make({ tagline: 'The Jupiter airdrop is confirmed and has run in phases since 2024.' }),
    );
    expect(/^[The ]/.test(b)).toBe(false);
    expect(b).toMatch(/[\u4e00-\u9fa5]/);
  });

  it('已有中文简介时保留原文（人工优先）', () => {
    const b = chineseBlurb(make({ tagline: '这是一句人工写的中文介绍。' }));
    expect(b).toBe('这是一句人工写的中文介绍。');
  });

  it('不同状态给出不同阶段说明', () => {
    expect(chineseBlurb(make({ status: 'claim_live' }))).toContain('领取入口已开放');
    expect(chineseBlurb(make({ status: 'ended' }))).toContain('已结束');
  });

  it('tagline 说已确认但 status 仍是 potential 时，文案不得自相矛盾', () => {
    // 实测数据里存在 27 个这样的项目；简介必须与原文对账，不能一边说 confirmed
    // 一边又写「尚未确认发币」
    const p = make({ tagline: 'The airdrop is confirmed, retroactive, and live.' });
    const b = chineseBlurb(p);
    expect(b).not.toContain('尚未确认');
    expect(b).toContain('已确认');
  });

  it('否定句式不会被误判为已确认', () => {
    expect(taglineSaysConfirmed('Amadeus has not confirmed a token airdrop.')).toBe(false);
    expect(taglineSaysConfirmed('Dow Protocol has not confirmed a token or an airdrop.')).toBe(false);
    expect(taglineSaysConfirmed('The airdrop is confirmed.')).toBe(true);
    expect(taglineSaysConfirmed('The Infinex airdrop is confirmed and live.')).toBe(true);
  });

  it('否定句式 + potential 时仍保留「尚未确认」的说明', () => {
    const b = chineseBlurb(make({ tagline: 'Amadeus has not confirmed a token airdrop.' }));
    expect(b).toContain('尚未确认');
  });

  it('protocolTypeOf 能抽出协议类型', () => {
    expect(protocolTypeOf('Lending 协议，TVL 约 $1M。')).toBe('Lending');
    expect(protocolTypeOf('中文介绍')).toBeNull();
  });
});

describe('同协议归组', () => {
  it('同一注册域的项目归到一组', () => {
    const a = make({ slug: 'aave-v3', name: 'Aave V3', official: { website: 'https://aave.com/' } });
    const b = make({ slug: 'aave-v4', name: 'Aave V4', official: { website: 'https://www.aave.com/v4' } });
    const g = groupByProtocol([a, b]);
    expect(g).toHaveLength(1);
    expect(g[0].variants).toHaveLength(1);
    expect([g[0].primary.slug, g[0].variants[0].slug].sort()).toEqual(['aave-v3', 'aave-v4']);
  });

  it('不同注册域不合并', () => {
    const a = make({ slug: 'a', official: { website: 'https://a.com' } });
    const b = make({ slug: 'b', official: { website: 'https://b.com' } });
    const g = groupByProtocol([a, b]);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.variants.length === 0)).toBe(true);
  });

  it('主条目优先选教程来源真实、证据多的那个', () => {
    const weak = make({ slug: 'weak', official: { website: 'https://proto.fi' } });
    const strong = make({
      slug: 'strong',
      official: { website: 'https://proto.fi' },
      guide_source: 'sourced',
    });
    const g = groupByProtocol([weak, strong]);
    expect(g[0].primary.slug).toBe('strong');
  });

  it('信息量相同时按 slug 字典序选主条目（结果稳定可复现）', () => {
    const a = make({ slug: 'zzz', official: { website: 'https://same.com' } });
    const b = make({ slug: 'aaa', official: { website: 'https://same.com' } });
    const g1 = groupByProtocol([a, b]);
    const g2 = groupByProtocol([b, a]);
    expect(g1[0].primary.slug).toBe('aaa');
    expect(g2[0].primary.slug).toBe('aaa');
  });

  it('归组不丢数据：所有项目都能在结果里找到', () => {
    const list = [
      make({ slug: 'aave-v3', official: { website: 'https://aave.com' } }),
      make({ slug: 'aave-v4', official: { website: 'https://aave.com' } }),
      make({ slug: 'solo', official: { website: 'https://solo.io' } }),
      make({ slug: 'no-site', official: {} }),
    ];
    const groups = groupByProtocol(list);
    const flat = flattenGroups(groups);
    const seen = new Set<string>();
    for (const e of flat) {
      seen.add(e.project.slug);
      for (const v of e.variants) seen.add(v.slug);
    }
    expect(seen.size).toBe(list.length);
    expect(seen.has('no-site')).toBe(true);
  });

  it('聚合站域名不参与归组（否则会把不相干项目合并隐藏）', () => {
    // 实测坑：Berachain / Monad / Zora 的 website 都是 app.galxe.com/quest/xxx，
    // 若按注册域归组会把三个毫不相干的项目合成一组，用户会以为项目消失了。
    expect(isAggregatorHost('app.galxe.com')).toBe(true);
    expect(isAggregatorHost('galxe.com')).toBe(true);
    expect(isAggregatorHost('defillama.com')).toBe(true);
    expect(isAggregatorHost('x.com')).toBe(true);
    expect(isAggregatorHost('aave.com')).toBe(false);
    expect(isAggregatorHost('app.uniswap.org')).toBe(false);
  });

  it('website 指向聚合站的项目退回 slug 分组，绝不与其它项目合并', () => {
    const bera = make({ slug: 'berachain', official: { website: 'https://app.galxe.com/quest/Berachain' } });
    const monad = make({ slug: 'monad', official: { website: 'https://app.galxe.com/quest/Monad' } });
    const zora = make({ slug: 'zora-network', official: { website: 'https://app.galxe.com/quest/Zora' } });
    const groups = groupByProtocol([bera, monad, zora]);
    expect(groups).toHaveLength(3);
    expect(groupKeyOf(bera)).toBe('slug:berachain');
    expect(groups.every((g) => g.variants.length === 0)).toBe(true);
  });

  it('无官网项目用 slug 作归组键，不会被错误合并', () => {
    const a = make({ slug: 'a', official: {} });
    const b = make({ slug: 'b', official: {} });
    expect(groupKeyOf(a)).toBe('slug:a');
    expect(groupKeyOf(b)).toBe('slug:b');
    expect(groupByProtocol([a, b])).toHaveLength(2);
  });
});
