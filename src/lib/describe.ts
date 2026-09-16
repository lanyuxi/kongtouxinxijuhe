/**
 * 一句话中文简介 + 同协议归组。
 *
 * 背景（第一性原理）：
 *   列表卡片现在只有一行「操作：存入资产、借出资产」，这是「要做什么」，
 *   却没回答小白最先问的「这项目是干什么的」。
 *   实测 188 个项目里，125 个的简介是数据源直接给的英文模板句，
 *   形如 `Lending 协议，TVL 约 $17360M。` —— 既不是中文，也没解释业务含义；
 *   另外 63 个是英文长句（如 `The Jupiter airdrop is confirmed…`）。
 *   两者对新手的价值都极低。
 *
 *   所以这里做一层「确定性中文解释」：
 *     把协议类型（Lending / DEX / Bridge…）映射成一句中文业务说明，
 *     TVL 只作为括号里的补充事实保留，不喧宾夺主。
 *     说明文字是**确定性映射**，不是运行时 AI 生成 —— 可测试、可复现、零成本。
 *
 *   同时解决「同一协议被拆成多条」的问题：
 *     aave-v3 / aave-v4 / aave-horizon-rwa 共用 aave.com，
 *     fluid-dex / fluid-lending / fluid-lite 共用 fluid.io。
 *     新手会把它们当 3 个不同空投，重复投入时间。
 *     因此按「注册域」归组，同组只展示主条目，其余折叠为「可参与的产品线」。
 */

import type { ListProject, Category, AirdropStatus } from './types';
import { hostOf, registrableDomain } from './scam';

/** 协议类型 → 中文业务说明（确定性映射，不含主观判断） */
const PROTOCOL_DESC: Record<string, string> = {
  Lending: '借贷协议：存入资产赚取利息，也能抵押借出其他资产。',
  Dexs: '去中心化交易所：在链上直接兑换代币，无需中心化平台。',
  DEX: '去中心化交易所：在链上直接兑换代币，无需中心化平台。',
  RWA: '现实世界资产：把国债、基金等链下资产搬到链上交易。',
  Bridge: '跨链桥：把资产从一条链转移到另一条链。',
  'Canonical Bridge': '官方跨链桥：由公链团队自己维护的资产跨链通道。',
  'Risk Curators': '风控策展方：为借贷池挑选与监控抵押资产，赚取管理收益。',
  'Liquid Staking': '流动性质押：质押代币后拿到可继续使用的凭证代币。',
  'Liquid Restaking': '流动性再质押：把已质押的凭证再次质押，叠加收益与风险。',
  Restaking: '再质押：把已质押资产再次用于为其他网络提供安全。',
  'Restaked BTC': '比特币再质押：把 BTC 相关凭证再质押以获取额外收益。',
  'Anchor BTC': 'BTC 锚定资产：以比特币为底层发行的链上资产。',
  'Decentralized BTC': '去中心化 BTC：不依赖单一托管方的比特币映射资产。',
  'Onchain Capital Allocator': '链上资金配置：把资金分配到不同链上策略中。',
  'Basis Trading': '基差交易：利用现货与合约价差赚取相对稳定收益。',
  Yield: '收益协议：通过策略帮你的资产产生利息或奖励。',
  'Yield Aggregator': '收益聚合器：自动把你的资金放进收益最高的策略。',
  Farm: '流动性挖矿：提供流动性以换取代币奖励。',
  CDP: '抵押债仓：抵押资产后借出稳定币，注意清算风险。',
  'CDP Manager': '抵押债仓管理：管理抵押资产与稳定币债务的工具。',
  'Collateral Markets': '抵押品市场：围绕抵押资产进行的借贷与交易市场。',
  'Staking Pool': '质押池：把代币集中质押以获取网络奖励。',
  Derivatives: '衍生品交易：链上的合约、期权等衍生品交易场所。',
  Payments: '支付协议：用链上资产完成收付款。',
  'Prediction Market': '预测市场：对事件结果下注，价格反映市场概率。',
};

/** 分类 → 中文兜底说明（协议类型未知时使用） */
const CATEGORY_DESC: Record<Category, string> = {
  DeFi: '去中心化金融项目，围绕存、借、换等链上资金操作。',
  L2: 'Layer 2 扩容网络，用于降低交易成本、提升速度。',
  AI: 'AI 相关项目，把人工智能能力放到链上或与代币结合。',
  DePIN: '去中心化物理基础设施，用代币激励真实世界的设备与带宽。',
  GameFi: '链上游戏项目，通过游玩或任务获得代币奖励。',
  Social: '社交类项目，用代币激励内容与互动。',
  Infra: '基础设施项目，为其他应用提供底层工具或服务。',
  NFT: 'NFT 相关项目，围绕数字藏品的铸造与交易。',
  Other: '链上项目，具体业务以官方说明为准。',
};

/** 状态 → 中文补充（说明「现在处于什么阶段」） */
const STATUS_DESC: Record<AirdropStatus, string> = {
  new: '刚被发现，信息还很有限，建议先观察。',
  potential: '尚未确认发币，属于需要提前参与、但结果不确定的类型。',
  confirmed: '官方已确认会有空投，可重点关注资格条件。',
  claim_live: '领取入口已开放，请尽快核对资格并在期限内领取。',
  ended: '活动已结束，仅作为资料保留，不建议再投入时间。',
};

/** 从 tagline 里抽出 TVL 金额，转成中文可读形式 */
function extractTvl(tagline: string): string | null {
  const m = tagline.match(/TVL\s*约?\s*\$?([\d.]+)\s*([MBK])/i);
  if (!m) return null;
  const num = Number(m[1]);
  const unit = m[2].toUpperCase();
  if (!Number.isFinite(num)) return null;
  const usd = unit === 'B' ? num * 1000 : unit === 'K' ? num / 1000 : num;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}B`;
  return `$${usd.toFixed(0)}M`;
}

/** 从 tagline 里抽出协议类型，例如 `Lending 协议，TVL 约 $17360M。` → Lending */
export function protocolTypeOf(tagline: string): string | null {
  const m = tagline.match(/^(.+?)\s*协议/);
  return m ? m[1].trim() : null;
}

/**
 * 从 tagline 判断「是否明确表示已确认 / 已上线」。
 *
 * ⚠️ 为什么需要这一步（实测发现的数据矛盾）：
 *   数据里有 27 个项目的 `tagline` 明确写着 `is confirmed` / `is live` / `has airdropped`，
 *   但 `status` 仍然是 `potential`。若简介直接用 status 生成阶段说明，
 *   就会出现「原文说 confirmed，简介说尚未确认发币」的自相矛盾 ——
 *   而本项目的不变量之一就是「不向用户展示互相矛盾的信息」。
 *
 *   因此这里做**保守对账**：tagline 明确说已确认时，阶段说明改用「官方已确认」；
 *   若只是说 `has not confirmed`，则仍按 status 走（不会被误判为已确认）。
 *
 *   注意：这里只修「简介文案」，不修改 status 本身 ——
 *   status 涉及评分与筛选，属于数据治理范畴，不能在前端展示层悄悄改。
 */
export function taglineSaysConfirmed(tagline: string): boolean {
  const t = tagline.toLowerCase();
  // 先排除否定句式，避免把 "has not confirmed" 判成已确认
  if (
    /not\s+(yet\s+)?confirm|no\s+token|hasn'?t\s+confirm|haven'?t\s+confirm|unconfirmed|not\s+live|not\s+open/.test(
      t,
    )
  ) {
    return false;
  }
  return /\bis confirmed\b|\bare confirmed\b|\bconfirmed\b|\bis live\b|\bare live\b|has airdropped|claim is open|is open/.test(
    t,
  );
}

/**
 * 与流水线侧 `scripts/lib/status.ts` 的推断规则保持一致。
 *
 * 为什么必须显式对齐：
 *   这里原本只有「文案对账」（避免简介与状态自相矛盾），
 *   而 P1-1 之后流水线会**真的按 tagline 修正 status**。
 *   两处规则若漂移，就会出现「文案认为已确认、数据已被改成潜在」的新矛盾 ——
 *   正是这次要修的那类问题。因此把否定词表与肯定词表统一口径。
 *   注意：这里不引入 scripts/ 的依赖（前端不能引构建脚本），
 *   改为在测试中做「两处规则行为一致」的交叉校验，见 tests/p1-1-status-consistency.test.ts。
 */
export const TAGLINE_NEGATIVE_HINT =
  /not\s+(yet\s+)?confirm|no\s+token|hasn'?t\s+confirm|haven'?t\s+confirm|unconfirmed|not\s+live|not\s+open/i;

/**
 * 生成一句话中文简介。
 *
 * 组成：业务说明（优先用协议类型的确定性映射）+ 阶段说明 + 可选 TVL。
 * 若 tagline 已是中文且有实质内容，则不覆盖，直接沿用。
 */
export function chineseBlurb(p: Pick<ListProject, 'tagline' | 'category' | 'status'>): string {
  const tagline = (p.tagline ?? '').trim();
  const type = protocolTypeOf(tagline);
  const tvl = extractTvl(tagline);

  // 已有中文一句话介绍（来自人工档案）时优先保留，人工永远第一优先
  if (tagline && /[\u4e00-\u9fa5]/.test(tagline) && !type) {
    return tagline;
  }

  const base = (type && PROTOCOL_DESC[type]) || CATEGORY_DESC[p.category] || CATEGORY_DESC.Other;

  // 阶段说明：status 与 tagline 对账，避免出现互相矛盾的文案
  let stage = STATUS_DESC[p.status] ?? '';
  if (taglineSaysConfirmed(tagline) && p.status === 'potential') {
    stage = '官方已确认该项目会有空投，可重点关注资格条件。';
  }

  const tvlText = tvl ? `当前锁仓规模约 ${tvl}。` : '';

  return [base, stage, tvlText].filter(Boolean).join('');
}

/* ------------------------------- 同协议归组 ------------------------------- */

/** 归组后的协议 */
export interface ProtocolGroup {
  /** 组内主条目（信息最全 / 最先出现的一个） */
  primary: ListProject;
  /** 同一协议下的其他产品线 */
  variants: ListProject[];
  /** 归组键：注册域，例如 aave.com；无法取域名时用 slug */
  key: string;
}

/**
 * 聚合站 / 数据平台域名黑名单：这些域名**不属于**任何单个项目。
 *
 * ⚠️ 这是实测踩出来的坑：
 *   数据里有些项目的 `official.website` 实际指向聚合站，
 *   例如 `app.galxe.com/quest/Monad`、`defillama.com/protocol/eigenlayer`。
 *   若直接按「注册域」归组，会把 **Berachain / Monad / Zora** 归成一组、
 *   把 **EigenLayer / Hyperliquid** 归成一组 —— 它们毫无关系。
 *   一旦归组，同一组里只会展示一个主条目，其余项目直接被隐藏，
 *   用户会以为项目消失了。这是比「看到重复」严重得多的故障。
 *
 *   因此：只有确认为「项目自有域名」时才允许参与归组，聚合站一律退回 slug 分组。
 */
const AGGREGATOR_HOSTS = [
  'galxe.com',
  'defillama.com',
  'airdrops.io',
  'airdropalert.com',
  'coinmarketcap.com',
  'coingecko.com',
  'questn.com',
  'zealy.io',
  'layer3.xyz',
  'debank.com',
  'twitter.com',
  'x.com',
  'medium.com',
  'github.com',
  'discord.com',
  't.me',
  'linktr.ee',
  'mirror.xyz',
  'notion.site',
  'docs.google.com',
];

export function isAggregatorHost(host: string): boolean {
  if (!host) return true;
  return AGGREGATOR_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

/** 取项目归属键：只有「项目自有官网域名」才参与归组，其余退回 slug（绝不误合并） */
export function groupKeyOf(p: ListProject): string {
  const w = p.official?.website;
  if (!w) return `slug:${p.slug}`;
  const host = hostOf(w);
  if (!host) return `slug:${p.slug}`;
  if (isAggregatorHost(host)) return `slug:${p.slug}`;
  return registrableDomain(host);
}

/**
 * 信息量评分：用于挑选组内「主条目」——教程越真实、证据越充分者优先。
 *
 * ⚠️ 列表瘦身后不能再读 `p.evidence`（详情字段，列表里不存在的）：
 *   这里改用「真实性置信度 + 来源数量」作为等价代理。
 *   二者本来就是由 evidence 逐项加权算出来的（见 scripts/lib/score.ts），
 *   因此排序语义不变，只是不再依赖未下发的原始明细。
 */
function richness(p: ListProject): number {
  let n = 0;
  // 排序权重：官方可追溯教程 > 第三方整理 > 通用流程示意。
  // third_party 排在中间只是「描述更准确」的排序微调，
  // 不影响等级上限（三者中只有 sourced 能进 S/A，见 score.ts）。
  n += p.guide_source === 'sourced' ? 100 : p.guide_source === 'third_party' ? 40 : 0;
  // 真实性分数直接反映「已验证证据有多少」；来源数反映交叉验证广度
  n += Math.round((p.scores?.authenticity ?? 0) / 2);
  n += (p.sources?.length ?? 0) * 5;
  n += p.official?.docs ? 5 : 0;
  n += p.official?.x ? 3 : 0;
  n += p.guide.length;
  n += p.tagline.length > 20 ? 2 : 0;
  return n;
}

/**
 * 把项目按「同一协议」归组。
 *
 * 只在同一分组键出现 ≥2 个条目时才产生变体；
 * 单条目组也返回（variants 为空），保证调用方无需分支处理。
 *
 * ⚠️ 关键取舍：归组**不删除**任何数据。
 *    主条目仍可点进详情，变体也各自保留自己的详情页与 URL，
 *    只是列表里不再并列展示 —— 既不误导用户重复投入，也不丢失信息。
 */
export function groupByProtocol(projects: ListProject[]): ProtocolGroup[] {
  const buckets = new Map<string, ListProject[]>();
  for (const p of projects) {
    const key = groupKeyOf(p);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const groups: ProtocolGroup[] = [];
  for (const [key, list] of buckets) {
    if (list.length === 1) {
      groups.push({ primary: list[0], variants: [], key });
      continue;
    }
    // 主条目 = 信息量最高者；同分时取 slug 字典序，保证结果稳定可复现
    const sorted = [...list].sort((a, b) => {
      const d = richness(b) - richness(a);
      if (d !== 0) return d;
      return a.slug.localeCompare(b.slug, 'en');
    });
    groups.push({ primary: sorted[0], variants: sorted.slice(1), key });
  }

  // 保持输入顺序（调用方通常已按时间倒序）
  const order = new Map(projects.map((p, i) => [p.slug, i]));
  groups.sort((a, b) => (order.get(a.primary.slug) ?? 0) - (order.get(b.primary.slug) ?? 0));
  return groups;
}

/**
 * 归组后再摊平：主条目 + 变体一起返回，但标记出归属关系。
 * 前端列表用这个结果渲染：主条目卡片可展开变体。
 */
export interface FlatEntry {
  project: ListProject;
  /** 同协议的其他产品线（仅主条目有值） */
  variants: ListProject[];
  /** 若本条目是某协议的产品线（非主条目），指向主条目 slug */
  variantOf?: string;
}

export function flattenGroups(groups: ProtocolGroup[]): FlatEntry[] {
  const out: FlatEntry[] = [];
  for (const g of groups) {
    out.push({ project: g.primary, variants: g.variants });
  }
  return out;
}
