/**
 * DefiLlama 数据源适配器（真实抓取）。
 *
 * 用途：第三方交叉验证 + 官方资料补全。
 *   - 从 https://api.llama.fi/protocols 读取全量协议列表（公开、无需 Key）
 *   - 提供 name / url / twitter / chains / category / tvl 等权威字段
 *
 * 与 Airdrops.io 的区别：DefiLlama 是「协议事实源」，不是空投源。
 * 因此这里产出的条目仅用于：
 *   1) 校验某个项目的官方域名是否真实存在且与聚合站一致（交叉验证）
 *   2) 补全官方 X 账号
 * 状态一律标记为 potential，绝不由它把项目「升级」为已确认空投。
 */

import type { SourceAdapter } from './types';
import type { RawItem } from '../lib/normalize';
import { fetchJson } from './lib/http';

const API = 'https://api.llama.fi/protocols';

/** 只取主流链上有实际 TVL 的协议，避免把 8000+ 条全量塞进前端数据 */
const MIN_TVL = 5_000_000;

/**
 * 剔除「不像空投标的」的实体。
 *
 * 为什么必须过滤：
 *   DefiLlama 是全量 DeFi 事实库，里面混着中心化交易所、LST / LRT 衍生品、
 *   包装资产、以及项目自己的子池（"X Staked Y" / "X Liquid"）。把这些当成
 *   「潜在空投项目」展示会严重误导用户，也稀释了真正值得研究的项目。
 *   宁可少、不可滥 —— 与方案「不盲目推荐」的原则一致。
 */
const EXCLUDE_PATTERNS: RegExp[] = [
  /\bcex\b/i, // 中心化交易所
  /\bwrapped\b/i, // 包装资产
  /\bstaked?\b/i, // 质押衍生品（"Staked ETH"）
  /\bliquid\b/i, // 流动性质押子池（"ether.fi Liquid"）
  /\blst\b|\blrt\b/i,
  /\bpooled\b/i,
  /\bindex\b/i,
  /\bvault\b/i,
  /\bbridge\b/i,
  /\bderivatives?\b/i,
  /\bbinance\b|\bcoinbase\b|\bokx\b|\bbybit\b|\bbitfinex\b|\bkraken\b|\bkorbit\b|\bindodax\b|\bgate\b|\bhtx\b|\bhuobi\b|\bkucoin\b/i,
];

/** 去掉联盟 / 追踪参数（DefiLlama 会在 url 后拼 ?ref=，展示出来很难看且不专业） */
export function cleanUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(ref|referral|utm_|aff|affiliate|invite|code)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString().replace(/\?$/, '');
  } catch {
    return url;
  }
}

interface LlamaProtocol {
  name: string;
  url?: string;
  twitter?: string;
  category?: string;
  chains?: string[];
  tvl?: number;
}

export const defiLlamaAdapter: SourceAdapter = {
  name: 'DefiLlama',
  url: API,

  async fetch(): Promise<RawItem[]> {
    const protocols = await fetchJson<LlamaProtocol[]>(API, { timeoutMs: 45_000, retries: 1 });
    if (!Array.isArray(protocols) || protocols.length === 0) {
      throw new Error('DefiLlama 返回空列表');
    }

    const fetchedAt = new Date().toISOString();
    const picked = protocols
      .filter((p) => typeof p.tvl === 'number' && p.tvl >= MIN_TVL)
      .filter((p) => !EXCLUDE_PATTERNS.some((re) => re.test(p.name)))
      // 类目为 CEX 的同样剔除：它们是交易所，不存在「项目空投」语义
      .filter((p) => !/^cex$/i.test((p.category ?? '').trim()))
      .filter((p) => !!p.url && /^https?:\/\//i.test(p.url))
      .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
      .slice(0, 120);

    console.log(
      `[defillama] 全量 ${protocols.length} 条，按 TVL ≥ $${MIN_TVL / 1e6}M 选取 ${picked.length} 条`,
    );

    return picked.map((p) => {
      const website = cleanUrl(p.url);
      const item: RawItem = {
        sourceType: 'third_party',
        sourceName: 'DefiLlama',
        sourceUrl: `https://defillama.com/protocol/${encodeURIComponent(p.name)}`,
        title: p.name,
        url: website ?? `https://defillama.com/protocol/${encodeURIComponent(p.name)}`,
        description: `${p.category ?? 'DeFi'} 协议，TVL 约 $${Math.round((p.tvl ?? 0) / 1e6)}M。`,
        statusText: 'potential',
        categoryText: p.category,
        chainText: (p.chains ?? []).slice(0, 3).join(', '),
        officialUrl: website,
        officialHost: website ? safeHost(website) : undefined,
        officialProfiles: {
          ...(website ? { website } : {}),
          ...(p.twitter ? { x: `https://x.com/${p.twitter.replace(/^@/, '')}` } : {}),
        },
        clueCapital: false,
        fetchedAt,
      };
      return item;
    });
  },
};

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
