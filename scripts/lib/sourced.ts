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
import {
  hasChinese,
  localizeText,
  localizeTitle,
  reverseLookup,
} from '../i18n/translate.mjs';

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
 * 按句子边界截断，尽量不切在句子中间。
 *
 * 为什么不用 slice：中文译文被硬切会产生「……因此在 7 月」这种半截句，
 * 用户读到这里会以为步骤没写完。优先取最后一个完整句子，
 * 实在没有句子边界时才退回硬切。
 */
function truncateAtSentence(text: string, max: number): string {
  const clean = String(text ?? '').trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const cut = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('！'),
    head.lastIndexOf('？'),
    head.lastIndexOf('；'),
  );
  return cut >= max * 0.4 ? head.slice(0, cut + 1) : head;
}

/**
 * 把来源侧抓到的步骤转换为系统教程步骤。
 * 注意：source_url 必须指向**可追溯的真实链接**，否则标注 source_verified=false。
 */
export function stepsFromSource(p: AirdropProject): GuideStep[] {
  const steps = p.sourcedSteps;
  if (!steps?.length) return [];
  const officialUrl = p.official.website ?? p.official.galxe ?? '';
  return steps.slice(0, 12).map((s, i) => {
    /**
     * 教程中文化（issue #28）。
     *
     * 数据源（Airdrops.io）给的 HowTo 全部是英文，直接渲染等于把英文教程
     * 原样丢给中文用户 —— 截图里的 `Check Your Eligibility` 就是这个问题。
     * 这里把它转成中文，并**原样保留英文原文**放在 `original_*` 字段上：
     *   · 有中文时展示中文；
     *   · 原文是英文时，前端在步骤下方以「原文对照」同时展示英文，
     *     避免「翻译失真」让用户照着做错事（例如按钮名对不上）。
     * 译文来自构建期缓存（scripts/i18n/cache.zh.json），运行期不调用任何翻译接口。
     */
    const title = localizeTitle(s.title);
    /**
     * ⚠️ 顺序不可颠倒：**先翻译，后截断**。
     *
     * 历史坑：先切片再查翻译缓存，切片会落在句子中间
     * （`...bridge widget O`），与缓存里的完整句子对不上，
     * 于是 22 个项目的步骤正文退化成英文原文 —— 正是本次要修的问题，
     * 而且不报错、不告警，只能靠逐项自检才发现。
     * 译文长度与原文并不相等，因此截断必须发生在译文上。
     */
    const body = localizeText(s.body ?? '按页面提示完成本步骤。');
    const rawTitle = hasChinese(s.title) ? undefined : s.title.slice(0, 80);
    const rawBody = hasChinese(s.body ?? '') ? undefined : (s.body ?? '').slice(0, 400);
    return {
      step: i + 1,
      title: title.zh.slice(0, 80),
      description: truncateAtSentence(body.zh, 400),
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
      // 英文原文对照：仅当原文不是中文时保留，供前端「原文对照」区块展示
      original_title: rawTitle,
      original_description: rawBody,
    };
  });
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
  //
  //    中文化（issue #28）：数据源给的多是英文长句，直接落盘会在
  //    列表卡片与详情页头部露出整段英文。这里先翻译再截断，
  //    并把英文原文挂在 tagline_en 上，供详情页「原文对照」使用。
  //    译文由构建期缓存提供（scripts/i18n/cache.zh.json），运行期不联网。
  if (item.description && item.description.length > 24) {
    const raw = firstSentence(item.description);
    next.tagline = applyLocalizedTagline(raw).tagline;
    next.tagline_en = applyLocalizedTagline(raw).tagline_en;
  } else {
    // 本轮来源没给描述时，tagline 会从 Last Known Good 继承下来 ——
    // 历史数据里存的是英文原文，不处理就等于「英文永远留在页面上」，
    // 而且只在来源轮空的项目上出现，最难被发现（实测 beezie / nexus / fireplace）。
    const inherited = applyLocalizedTagline(next.tagline ?? '');
    next.tagline = inherited.tagline;
    next.tagline_en = inherited.tagline_en ?? next.tagline_en;
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

/**
 * 生成中文 tagline + 英文原文对照。
 *
 * 单独抽出来，是因为它必须被**两处**调用：
 *   · 本轮抓到描述时 —— 把英文描述译成中文；
 *   · 本轮没抓到描述时 —— 把从上一版继承下来的英文 tagline 译成中文。
 * 后者是关键：来源轮空的项目（Airdrops.io 的分类页会换批次）
 * 其 tagline 会一直保留英文原文，如果只处理前者，
 * 页面上就会长期残留少量英文，且因为「只有几条」而极易被漏掉。
 */
function applyLocalizedTagline(raw: string): { tagline: string; tagline_en?: string } {
  const text = String(raw ?? '').trim();
  if (!text) return { tagline: '' };
  const localized = localizeText(text);
  return {
    tagline: (localized.zh || text).slice(0, 140),
    tagline_en: localized.en ? text.slice(0, 200) : undefined,
  };
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
    if (item) return applySourced(p, item);
    /**
     * 本轮来源轮空的项目也要过一遍。
     *
     * 为什么不能直接 `return p`：
     *   它的 tagline / 教程步骤是从上一版继承下来的**英文原文**，
     *   原样返回就等于把英文永久留在页面上 ——
     *   而且只在「恰好这一轮没被来源覆盖」的项目上出现，
     *   数量少、位置随机，是最难被自检发现的一类残留。
     *   这里只做「文案中文化」，不触碰任何事实性字段，
     *   因此不会把 A 项目的信息写进 B 项目。
     */
    return localizeCarriedOver(p);
  });
}

/**
 * 把「上一版继承下来的英文文案」转成中文。
 *
 * 严格只改文案字段：tagline / guide 的标题与描述。
 * 其余字段（状态、评分、证据、来源）一律不动 —— 那些是事实，
 * 不能因为一次本地化就发生任何变化。
 */
function localizeCarriedOver(p: AirdropProject): AirdropProject {
  let changed = false;
  const next: AirdropProject = { ...p };

  if (next.tagline && !hasChinese(next.tagline)) {
    // ⚠️ 必须先取值、再覆盖：先赋 next.tagline 再读它，
    //    拿到的已经是中文译文，tagline_en 会变成「中文原文」（真实踩过）。
    const original = next.tagline;
    const localized = localizeText(original);
    if (hasChinese(localized.zh)) {
      next.tagline = localized.zh.slice(0, 140);
      next.tagline_en = localized.en ? original.slice(0, 200) : undefined;
      changed = true;
    }
  } else if (next.tagline && !next.tagline_en) {
    // tagline 已是中文译文（上一轮翻译后落盘），但英文原文没保存下来：
    // 从缓存反向找回，保证「原文对照」不会因为多跑一轮就消失。
    const en = reverseLookup(next.tagline);
    if (en) {
      next.tagline_en = en.slice(0, 200);
      // 这里也要置 changed：否则返回值直接回退成入参对象，
      // 刚补上的英文原文会被原样丢掉（真实踩过：对照栏永远是空的）。
      changed = true;
    }
  }

  if (next.guide?.length) {
    const guide = next.guide.map((g) => {
      if (hasChinese(g.title) && hasChinese(g.description)) return g;
      const title = localizeTitle(g.title ?? '');
      const body = localizeText(g.description ?? '');
      changed = true;
      return {
        ...g,
        title: hasChinese(title.zh) ? title.zh.slice(0, 80) : g.title,
        description: hasChinese(body.zh) ? truncateAtSentence(body.zh, 400) : g.description,
        original_title: g.original_title ?? (hasChinese(g.title) ? undefined : g.title),
        original_description:
          g.original_description ?? (hasChinese(g.description) ? undefined : g.description),
      };
    });
    next.guide = guide;
  }

  return changed ? next : p;
}

function richness(it: NormalizedItem): number {
  return (
    (it.steps?.length ?? 0) * 2 +
    (it.description ? 3 : 0) +
    (it.officialUrl ? 2 : 0) +
    Object.keys(it.officialProfiles ?? {}).length
  );
}
