/**
 * Normalize：将各数据源抓取到的异构条目，统一为标准结构。
 *
 * 对应方案文档第 19 章数据采集架构中的 Normalize 环节。
 * 该阶段只做「结构归一」，不做评分与判定。
 */

export type RawSourceType =
  | 'airdrop_aggregator'
  | 'rewards_tracker'
  | 'quest_platform';

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

/** 中文类目归一 */
export function normalizeCategory(text?: string): string {
  if (!text) return 'Other';
  const t = text.toLowerCase();
  if (/(defi|lending|dex|yield|staking|liquid)/.test(t)) return 'DeFi';
  if (/(layer\s?2|l2|rollup|zk)/.test(t)) return 'L2';
  if (/(\bai\b|agent|llm|artificial)/.test(t)) return 'AI';
  if (/(depin|infrastructure network|hardware)/.test(t)) return 'DePIN';
  if (/(game|gaming|play)/.test(t)) return 'GameFi';
  if (/(social|community|creator)/.test(t)) return 'Social';
  if (/(infra|oracle|bridge|modular|data)/.test(t)) return 'Infra';
  if (/(nft|collectible|marketplace)/.test(t)) return 'NFT';
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
    officialUrl: guessOfficialUrl(raw.url, name),
    fetchedAt: raw.fetchedAt,
    rawTitle: raw.title,
  };
}

export function normalizeAll(items: RawItem[]): NormalizedItem[] {
  return items.map(normalize);
}
