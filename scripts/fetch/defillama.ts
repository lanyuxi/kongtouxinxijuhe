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
/**
 * ⚠️ 这段规则已抽到 `scripts/lib/non-airdrop.ts`，**必须从那里导入**。
 *
 * 为什么要抽出去（原本的错误做法）：
 *   规则只写在抓取侧，而治理侧（Prune / 前端域名库）完全不知道它的存在。
 *   于是「代码里写了排除规则、库里却留着应该排除的条目」——
 *   实测 data/details/ 下残留 56 个这样的分片，其中包括 binance-cex。
 *   规则集中一处，才能保证「抓的时候排除」与「治理的时候清理」是同一条规则。
 */
import { EXCLUDE_PATTERNS, EXCLUDE_CATEGORY_PATTERNS } from '../lib/non-airdrop';

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
      /**
       * 类目过滤：只砍掉**强类目**（CEX / 中心化平台）——
       * 它们不是「一个可参与的活动」，而是交易场所。
       *
       * ⚠️ 不要在这里加弱类目（Bridge / Liquid Staking / Restaking …）。
       *    独立审查用真实数据否决过这个做法：
       *      · LayerZero（Bridge）已发 ZRO 空投，库里是 claim_live；
       *      · EigenLayer / EigenCloud（Restaking）发过 6000 万美元空投；
       *      · Lido / Rocket Pool / Stader / Kelp（LST）与 Yearn（Yield Aggregator）
       *        同样都有空投叙事。
       *    14 类一刀切实测会把选中集从 682 条砍到 458 条（净排除 224 条）。
       *
       *    弱类目改由 `classifyNonAirdrop` 在**治理阶段**处理，
       *    并且必须叠加「没有空投叙事证据」才排除 —— 抓取阶段
       *    还没有 tagline / tasks，判不了证据，因此这里只管强类目。
       */
      .filter((p) => !EXCLUDE_CATEGORY_PATTERNS.some((re) => re.test((p.category ?? '').trim())))
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
