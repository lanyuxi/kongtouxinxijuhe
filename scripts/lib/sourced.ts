/**
 * Sourced：把「数据源侧真实抓到的信息」提升为项目的一等字段。
 *
 * 为什么单独一层：
 *   Normalize 只做结构归一，Merge 只做去重合并，两者都不该关心「官网 / 教程 / 成本」
 *   这类**语义**字段。而真实抓取（AirDrops.io 的 outbound 链接、HowTo 步骤、
 *   DefiLlama 的协议事实）恰好提供了这些字段，需要一个明确的阶段来落地，
 *   并统一遵守「第三方链接不等于官方链接」这条不变量。
 *
 * 处理顺序：Merge → sourced → Verify → Enrich(人工档案覆盖) → Verify → Score → Guide
 */

import type { AirdropProject, Category, CostModel, GuideStep } from '../../src/lib/types';
import type { NormalizedItem } from './normalize';
import { normalizeCategory } from './normalize';

/** 从链接取主机名，失败返回空串 */
function host(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 默认不收集用户任何数据；这里只是确保官方资料字段的形态统一 */
function mergeOfficial(
  base: AirdropProject['official'],
  incoming?: NormalizedItem['officialProfiles'],
): AirdropProject['official'] {
  if (!incoming) return base;
  const out = { ...base };
  for (const key of ['website', 'x', 'docs', 'github', 'discord', 'galxe'] as const) {
    if (!out[key] && incoming[key]) out[key] = incoming[key];
  }
  return out;
}

/**
 * 把来源侧抓到的步骤转换为系统教程步骤。
 * 注意：source_url 必须指向**可追溯的真实链接**，否则标注 source_verified=false。
 */
export function stepsFromSource(p: AirdropProject): GuideStep[] {
  const steps = p.sourcedSteps;
  if (!steps?.length) return [];
  const officialUrl = p.official.website ?? p.official.galxe ?? '';
  return steps.slice(0, 12).map((s, i) => ({
    step: i + 1,
    title: s.title.slice(0, 80),
    description: (s.body ?? '').slice(0, 400) || '按页面提示完成本步骤。',
    official_url: officialUrl,
    minutes: 3,
    cost_usd: 0,
    needs_wallet: /钱包|wallet|connect/i.test(s.body ?? ''),
    needs_signature: /签名|sign|approve|授权/i.test(s.body ?? ''),
    risk: 'low' as const,
    done_when: '页面显示该步骤已完成 / 状态已更新。',
    // 只有步骤自带的 url 才算「可追溯的步骤来源」。
    // 不能退化成聚合站条目链接：那是「这个项目从哪发现的」，
    // 不是「这一步从哪来的」，拿来标 source_verified 属于伪造可追溯性。
    source_url: s.url,
    source_verified: !!s.url,
  }));
}

/** 依据来源描述推断成本模型（保守：拿不到证据就按 0 处理，不夸大） */
export function costFromSource(p: AirdropProject): Partial<CostModel> {
  const text = [
    p.tagline,
    ...p.tasks,
    ...p.requirements,
    ...(p.risks ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const needsCapital = /deposit|存入|质押|stake|流动性|liquidity|购买|buy|trade|交易/.test(text);
  const needsGas = /gas|手续费|onchain|链上/.test(text);

  if (!needsCapital && !needsGas) return {};
  return {
    capital_min_usd: needsCapital ? 20 : 0,
    capital_max_usd: needsCapital ? 200 : 0,
    gas_estimate_usd: needsGas ? 5 : 0,
  };
}

/**
 * 从来源类目 + 描述里推断「主要任务」。
 *
 * 为什么需要：
 *   只有聚合站提供 HowTo 的项目才有真实步骤；DefiLlama 这类事实源
 *   只给协议类型。若不为它们推断任务，卡片上会出现 200 多张一模一样的
 *   「操作：研究项目，择机参与」，列表完全失去参考价值。
 *
 * 推断原则（保守）：
 *   - 只根据**协议类型**给出该类型必然存在的动作（借贷要存款、DEX 要交易），
 *     这些都是该类协议的客观使用方式，不是编造活动规则；
 *   - 推断不出就不给，宁可留空也不硬凑。
 */
const CATEGORY_TASK_RULES: { re: RegExp; tasks: string[] }[] = [
  { re: /lending|cdp|collateral/i, tasks: ['存入资产', '借出资产', '保持健康度'] },
  { re: /dex|dexs|swap|aggregator/i, tasks: ['执行交易', '提供流动性'] },
  { re: /perpetual|derivativ|option|basis/i, tasks: ['开仓交易', '提供流动性'] },
  { re: /liquid staking|staking|restaking|lst|lsd/i, tasks: ['质押资产', '持有凭证'] },
  { re: /yield|vault|asset management/i, tasks: ['存入资产', '持有份额'] },
  { re: /bridge|interoperab|canonical/i, tasks: ['跨链转移', '绑定钱包'] },
  { re: /rwa|real world/i, tasks: ['完成资格认证', '持有资产'] },
  { re: /prediction/i, tasks: ['参与预测', '提供流动性'] },
  { re: /insurance/i, tasks: ['购买保险', '提供承保'] },
  { re: /payment|pay/i, tasks: ['完成支付', '绑定账户'] },
  { re: /wallet/i, tasks: ['创建钱包', '完成交互'] },
  { re: /nft|collectible|gacha/i, tasks: ['铸造 NFT', '参与活动'] },
  { re: /game|gaming/i, tasks: ['创建账号', '参与游戏'] },
  { re: /social|socialfi/i, tasks: ['创建账号', '发布内容', '邀请用户'] },
  { re: /ai|agent/i, tasks: ['完成注册', '试用产品'] },
  { re: /memecoin|meme/i, tasks: ['查看资格', '领取空投'] },
  { re: /rollup|zk|layer\s?2/i, tasks: ['跨链进入', '完成交互'] },
];

export function tasksFromSource(categoryText?: string): string[] {
  if (!categoryText) return [];
  for (const rule of CATEGORY_TASK_RULES) {
    if (rule.re.test(categoryText)) return rule.tasks;
  }
  return [];
}

/**
 * 主入口：把来源侧数据落到项目上。
 * 幂等：重复执行结果一致。
 */
export function applySourced(p: AirdropProject, item: NormalizedItem): AirdropProject {
  const next: AirdropProject = { ...p };

  // 1) 官方资料：仅补充空字段，绝不覆盖人工档案（人工档案在 Enrich 阶段后置覆盖）
  next.official = mergeOfficial(p.official, item.officialProfiles);

  // 2) 候选官网：仅当当前没有官网，或当前官网是聚合站时才替换
  const currentHost = host(next.official.website);
  const incomingHost = host(item.officialUrl);
  const isAggregator = /(airdrops\.io|defillama\.com|galxe\.com)$/.test(currentHost);
  if (incomingHost && !/airdrops\.io|defillama\.com|galxe\.com/.test(incomingHost)) {
    if (!next.official.website || isAggregator) {
      next.official.website = item.officialUrl;
    }
  }

  // 3) 一句话介绍：优先用真实描述（截断到一句可读长度）
  if (item.description && item.description.length > 24) {
    next.tagline = firstSentence(item.description).slice(0, 140);
  }

  // 3.1) 分类：来源给出的原始类目比 Merge 阶段的占位值准确，
  //      且能修正「先由 DefiLlama 建档、类目落成 Other」这种情况。
  const incomingCategory = normalizeCategory(item.categoryText) as Category;
  if (incomingCategory !== 'Other' && next.category === 'Other') {
    next.category = incomingCategory;
  } else if (incomingCategory !== 'Other' && incomingCategory !== next.category) {
    // 两者都非 Other 但不同：以「更具体」的来源类目为准（聚合站类目更贴近实际玩法）
    if (item.sourceType === 'airdrop_aggregator') next.category = incomingCategory;
  }

  // 4) 融资线索
  if (item.funding && !next.meta?.funding) {
    next.meta = { ...(next.meta ?? {}), funding: item.funding };
  }

  // 5) 成本线索
  const cost = costFromSource({ ...next, ...(item.description ? { tagline: item.description } : {}) });
  if (Object.keys(cost).length) {
    next.cost = { ...next.cost, ...cost };
  }

  // 6) 真实教程步骤：存到内部字段，Guide 阶段优先使用
  if (item.steps?.length) {
    next.sourcedSteps = item.steps.slice(0, 12);
  }

  // 7) 主要任务：有真实步骤时由 Guide 派生；否则按协议类型推断
  if (next.tasks.length === 0) {
    const inferred = tasksFromSource(item.categoryText);
    if (inferred.length) next.tasks = inferred;
  }

  // 8) 参与要求：从官方资料与成本线索推断（保守，不夸大）
  if (next.requirements.length === 0) {
    const req: string[] = ['钱包'];
    if (next.official.x) req.push('X 账号');
    if (cost.gas_estimate_usd) req.push('主网 Gas');
    if (item.clueCapital || (cost.capital_max_usd ?? 0) > 0) req.push('资金准备');
    next.requirements = req;
  }

  return next;
}

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const cut = clean.search(/[.。!！;；]\s/);
  const head = cut > 24 ? clean.slice(0, cut + 1) : clean;
  return head.length > 140 ? `${head.slice(0, 137)}...` : head;
}

/**
 * 批量应用。
 * 关键：只有当条目与项目 slug 一致时才应用，避免把 A 项目的信息写进 B 项目。
 */
export function applyAllSourced(
  projects: AirdropProject[],
  items: NormalizedItem[],
): AirdropProject[] {
  const bySlug = new Map<string, NormalizedItem>();
  for (const it of items) {
    const prev = bySlug.get(it.slug);
    // 同一 slug 可能来自多个来源：优先保留「信息更丰富」的那条
    if (!prev || richness(it) > richness(prev)) bySlug.set(it.slug, it);
  }
  return projects.map((p) => {
    const item = bySlug.get(p.slug);
    return item ? applySourced(p, item) : p;
  });
}

function richness(it: NormalizedItem): number {
  return (
    (it.steps?.length ?? 0) * 2 +
    (it.description ? 3 : 0) +
    (it.officialUrl ? 2 : 0) +
    Object.keys(it.officialProfiles ?? {}).length
  );
}
