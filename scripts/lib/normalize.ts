/**
 * Normalize：将各数据源抓取到的异构条目，统一为标准结构。
 *
 * 对应方案文档第 19 章数据采集架构中的 Normalize 环节。
 * 该阶段只做「结构归一」，不做评分与判定。
 */

export type RawSourceType =
  | 'airdrop_aggregator'
  | 'rewards_tracker'
  | 'quest_platform'
  | 'third_party';

/** 数据源产出的原始条目 */
export interface RawItem {
  sourceType: RawSourceType;
  sourceName: string;
  sourceUrl: string;
  /** 原始标题 */
  title: string;
  /** 原始链接 */
  url: string;
  /** 原始描述 */
  description?: string;
  /** 原始状态文本 */
  statusText?: string;
  /** 原始分类/类型文本 */
  categoryText?: string;
  /** 原始公链文本 */
  chainText?: string;
  /** 抓取时间 */
  fetchedAt: string;
  /** 候选官方链接（由来源侧尽力提取，是否可信交给 verify 交叉验证） */
  officialUrl?: string;
  /** 候选官方域名（用于交叉验证时比对，不直接展示） */
  officialHost?: string;
  /** 来源侧可提供的官方资料（X / Docs / GitHub 等） */
  officialProfiles?: Partial<Record<'website' | 'x' | 'docs' | 'github' | 'discord' | 'galxe', string>>;
  /** 来源侧提供的分步教程（例如聚合站的 HowTo） */
  steps?: { title: string; body?: string; url?: string }[];
  /** 成本线索：是否需要资金投入 */
  clueCapital?: boolean;
  /** 成本线索：是否需要连接钱包 */
  clueWallet?: boolean;
  /** 成本线索：预估耗时（分钟） */
  clueMinutes?: number;
  /** 融资 / 投资方线索 */
  funding?: string;
}

/** 归一化后的候选条目 */
export interface NormalizedItem {
  slug: string;
  name: string;
  tagline: string;
  status: string;
  categoryText?: string;
  chains: string[];
  sourceType: RawSourceType;
  sourceName: string;
  sourceUrl: string;
  officialUrl: string;
  fetchedAt: string;
  rawTitle: string;
  /** 候选官方域名（用于交叉验证比对） */
  officialHost?: string;
  /** 来源侧提供的官方资料链接 */
  officialProfiles?: RawItem['officialProfiles'];
  /** 来源侧提供的分步教程 */
  steps?: RawItem['steps'];
  /** 成本线索 */
  clueCapital?: boolean;
  clueWallet?: boolean;
  clueMinutes?: number;
  /** 融资线索 */
  funding?: string;
  /** 原始描述（用于生成 tagline 兜底） */
  description?: string;
}

/** 生成 URL 友好的 slug，同时作为去重主键 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || 'unknown-project';
}

/**
 * 尝试从聚合站链接中还原项目官方域名。
 * 注意：这里只是「候选官方链接」，是否可信必须交给 verify 阶段交叉验证。
 */
export function guessOfficialUrl(url: string, title: string): string {
  try {
    const u = new URL(url);
    // airdrops.io 的项目页通常是 /project-name/，官方链接需从描述中提取，此处先返回卡片链接
    if (/(airdrops\.io|defillama\.com|galxe\.com)/.test(u.hostname)) {
      return url;
    }
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return title ? `https://${slugify(title)}.example` : '';
  }
}

/**
 * 类目归一（中文标签见 labels.ts）。
 *
 * 说明：上游聚合站的原始类目远比我们内部的 9 个分类细（memecoin / rwa /
 * perpetual / prediction market / rollup ...）。这里做「细类 → 粗类」的映射，
 * 避免大量项目掉进 Other 而失去筛选价值。
 * 规则顺序即优先级：越具体的类越靠前，金融与基础设施等宽泛类放最后。
 */
const CATEGORY_RULES: { re: RegExp; to: string }[] = [
  { re: /(layer\s?2|\bl2\b|rollup|zk-?evm|zk)/, to: 'L2' },
  { re: /(\bai\b|agent|llm|artificial|machine learning)/, to: 'AI' },
  { re: /(depin|infrastructure network|hardware|node|bandwidth|storage network)/, to: 'DePIN' },
  { re: /(game|gaming|play|metaverse)/, to: 'GameFi' },
  { re: /(social|socialfi|community|creator|content|messaging)/, to: 'Social' },
  { re: /(nft|collectible|marketplace|gacha|memecoin|meme)/, to: 'NFT' },
  {
    re: new RegExp(
      [
        'defi', 'lending', 'dex', 'yield', 'staking', 'liquid', 'swap', 'perpetual',
        'derivatives', 'prediction', 'option', 'vault', 'asset management', 'rwa',
        'real world', 'stablecoin', 'liquidity', 'trading', 'exchange', 'bridge',
        'interoperability', 'wallet', 'payment', 'pay', 'insurance', 'index',
        'restaking', 'lst', 'lsd', 'cdp', 'collateral', 'treasury', 'fund',
        'capital', 'market', 'btc', 'bitcoin',
      ].join('|'),
    ),
    to: 'DeFi',
  },
  {
    re: new RegExp(
      [
        'infra', 'oracle', 'modular', 'data', 'rpc', 'sdk', 'protocol', 'blockchain',
        'l1', 'layer1', 'chain', 'security', 'indexer', 'attestation', 'identity',
        'domain', 'name service', 'compute', 'scaling', 'curator', 'allocator',
      ].join('|'),
    ),
    to: 'Infra',
  },
];

export function normalizeCategory(text?: string): string {
  if (!text) return 'Other';
  const t = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(t)) return rule.to;
  }
  return 'Other';
}

/** 公链归一 */
const CHAIN_ALIASES: Record<string, string> = {
  ethereum: 'Ethereum',
  eth: 'Ethereum',
  solana: 'Solana',
  sol: 'Solana',
  base: 'Base',
  arbitrum: 'Arbitrum',
  arb: 'Arbitrum',
  optimism: 'Optimism',
  op: 'Optimism',
  bnb: 'BNB Chain',
  bsc: 'BNB Chain',
  'bnb chain': 'BNB Chain',
  sui: 'Sui',
};

export function normalizeChain(text?: string): string {
  if (!text) return 'Other';
  const key = text.trim().toLowerCase();
  return CHAIN_ALIASES[key] ?? 'Other';
}

/**
 * 从任意状态文本推断标准状态。
 * 无法判断时返回 potential（保守，不轻易标记为已确认）。
 */
export function normalizeStatus(text?: string): string {
  if (!text) return 'potential';
  const t = text.toLowerCase();
  if (/(claim|live|claiming|领取)/.test(t)) return 'claim_live';
  if (/(confirm|verified|已确认|official)/.test(t)) return 'confirmed';
  if (/(end|closed|expired|finished|结束)/.test(t)) return 'ended';
  if (/(potential|rumor|speculat|potential|潜在)/.test(t)) return 'potential';
  if (/(new|latest|近期)/.test(t)) return 'new';
  return 'potential';
}

/** 主入口：RawItem -> NormalizedItem */
export function normalize(raw: RawItem): NormalizedItem {
  const name = raw.title.trim().replace(/\s+/g, ' ');
  return {
    slug: slugify(name),
    name,
    tagline: (raw.description ?? '').trim().slice(0, 120),
    status: normalizeStatus(raw.statusText),
    categoryText: raw.categoryText,
    chains: [normalizeChain(raw.chainText)],
    sourceType: raw.sourceType,
    sourceName: raw.sourceName,
    sourceUrl: raw.sourceUrl,
    // 优先使用来源侧真实提取到的官方链接；拿不到才退化为链接猜域名
    officialUrl: raw.officialUrl ?? guessOfficialUrl(raw.url, name),
    fetchedAt: raw.fetchedAt,
    rawTitle: raw.title,
    officialHost: raw.officialHost,
    officialProfiles: raw.officialProfiles,
    steps: raw.steps,
    clueCapital: raw.clueCapital,
    clueWallet: raw.clueWallet,
    clueMinutes: raw.clueMinutes,
    funding: raw.funding,
    description: raw.description,
  };
}

export function normalizeAll(items: RawItem[]): NormalizedItem[] {
  return items.map(normalize);
}
