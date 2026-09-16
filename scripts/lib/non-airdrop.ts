/**
 * 非空投条目治理（P0-1）。
 *
 * 背景（2026-09-15 用户体验五要素审查的 BUG-1，2026-09-16 复核确认）：
 *   DefiLlama 是「DeFi 事实源」，不是空投源。它把中心化交易所、跨链桥、
 *   质押衍生品、LST/LRT 子池一并列入协议表，早期版本没有过滤就把它们
 *   当成「潜在空投项目」抓进了库。
 *
 *   实测证据（不是推测）：
 *     - `data/details/` 下残留 56 个**已出库条目**的分片文件，
 *       其中 binance-cex.json 的 title 是 "Binance CEX"，
 *       `recommendation.action` 是 `observe`，`official.website` 是 binance.com。
 *       部分条目在更早的评分规则下确实被判过 `participate` / S 级，
 *       后来虽然换了过滤规则，但**旧分片从未被清理**，
 *       任何基于 `data/details/` 的消费方（含历史版本前端、脚本、外部索引）
 *       都会继续把「交易平台」读成一个可参与的空投。
 *     - `pruneProjects` 只认「连续 N 轮缺席」，不认「来源类型已停收」。
 *       一个条目只要一直由某个来源提供，就永远不会因为「它本来就不是空投」而出库。
 *     - `buildOfficialDomains()` 把所有条目的官网收进「官方域名库」，
 *       被下架的交易所域名仍留在里面。用户拿真域名（binance.com）去「防骗自查」
 *       会被判成「无法确认」，这本身就是误导。
 *
 * 治理原则：
 *   1. **规则集中在一处**，抓取（fetch 侧过滤）与治理（prune / 前端）共用同一份定义，
 *      杜绝「代码里写了规则、库里没应用」这类断层再次发生；
 *   2. **只按客观结构判断**（协议名、类目），不按主观印象；
 *   3. **可解释**：每条判定都给出命中的规则，便于人工复核误杀。
 */

/** 空投条目应当排除的协议特征（与 scripts/fetch/defillama.ts 使用同一份规则） */
export const EXCLUDE_PATTERNS: RegExp[] = [
  /\bcex\b/i, // 中心化交易所
  /\bdex\s?cex\b/i, // 混合型交易所
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
  // 2026-09-16 复核补充：实测残留在 data/details 里的交易平台 / 支付机构
  /\bgemini\b|\bmexc\b|\brobinhood\b|\bbitget\b|\bbitstamp\b|\bbitvavo\b|\bbitkub\b|\bbitmex\b|\bderibit\b|\bhashkey\b|\bnexo\b|\bpoloniex\b|\bphemex\b|\bschwab\b/i,
  /\bcrypto\.com\b|\bswissborg\b|\bosl\b|\bweex\b|\bbingx\b/i,
];

/**
 * 类目级别的排除规则。
 *
 * 为什么要单独看类目：`DefiLlama` 的协议名未必带 "CEX" 字样，
 * 但 `category` 一定是 "CEX"。只按 name 过滤会漏掉一部分。
 */
export const EXCLUDE_CATEGORY_PATTERNS: RegExp[] = [/^cex$/i, /^centralized/i];

export interface NonAirdropVerdict {
  /** 是否属于「非空投条目」 */
  excluded: boolean;
  /** 命中的规则描述（可解释，供人工复核） */
  reason?: string;
  /** 命中的具体特征串 */
  pattern?: string;
}

/**
 * 判断一个协议名是否属于「非空投条目」。
 * 注意：绝不使用「子串包含」这种粗放写法去匹配域名（x.com 误杀 frax.com 的教训）。
 * 这里针对的是**协议名**的英文单词边界，`\b` 保证不会跨词误伤。
 */
export function isNonAirdropName(name: string): boolean {
  return classifyNonAirdrop({ name }).excluded;
}

/** 综合名称与类目给出判定 */
export function classifyNonAirdrop(input: {
  name: string;
  categoryText?: string;
}): NonAirdropVerdict {
  const name = (input.name ?? '').trim();
  const category = (input.categoryText ?? '').trim();

  for (const re of EXCLUDE_CATEGORY_PATTERNS) {
    if (re.test(category)) {
      return { excluded: true, reason: `类目为「${category}」（交易所，不属于空投项目）`, pattern: re.source };
    }
  }
  for (const re of EXCLUDE_PATTERNS) {
    if (re.test(name)) {
      const m = name.match(re);
      return {
        excluded: true,
        reason: `名称命中排除规则（${m?.[0] ?? re.source}）：交易所 / 包装资产 / 质押衍生品不属于空投项目`,
        pattern: re.source,
      };
    }
  }
  return { excluded: false };
}

/**
 * 条目是否「可能是真实空投项目」。
 *
 * 与 `isNonAirdropName` 的区别：这里额外允许通过**官方证据**翻案 ——
 * 若该条目在人工档案（data/seed/official-profiles.json）中登记过，
 * 说明有人工确认它是空投项目，此时不按名称规则出库。
 * 这条口子必须存在，否则像 "Gate"（gate.io 同时是交易所也是项目池）这类
 * 边界情况会被一刀切掉。
 */
export function isNonAirdropEntry(
  input: { name: string; categoryText?: string },
  opts: { hasHumanProfile?: boolean } = {},
): NonAirdropVerdict {
  if (opts.hasHumanProfile) return { excluded: false };
  return classifyNonAirdrop(input);
}
