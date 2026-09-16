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

/**
 * 非空投条目的排除规则（与 scripts/fetch/defillama.ts 使用同一份定义）。
 *
 * ⚠️ 设计要点（这条来自一次真实误伤，务必保留）：
 *   初版把 `index` / `vault` / `bridge` / `liquid` 直接作为**裸词**匹配，
 *   于是把真实项目也一起排掉了：
 *     · `Index Coop`   （真实的指数协议）
 *     · `Vault Street` （真实的收益协议）
 *     · `ether.fi Liquid` 这类才是我们真正想排除的「子池」
 *
 *   问题在于：裸词匹配无法区分「这个词是项目名的一部分」
 *   与「这个词描述的是某个衍生品/子池」。
 *   例如 `Polygon Bridge` 指的是官方跨链桥（非空投语义），
 *   而 `Bridge` 单独出现时未必是桥（可能是项目名里的一个词）。
 *
 *   因此在裸词匹配之外，引入**排除名单**：确认是真实空投项目的名字
 *   直接豁免。名单保持**极小且必须有理由** —— 它不该变成
 *   「凡是误删就往里加」的垃圾桶，只登记已核实的边界情况。
 */
export const EXCLUDE_PATTERNS: RegExp[] = [
  /\bcex\b/i, // 中心化交易所
  /\bdex\s?cex\b/i, // 混合型交易所
  /\bwrapped\b/i, // 包装资产
  /\bstaked?\b/i, // 质押衍生品（"Staked ETH"）
  /\bliquid\s+(staking|restaking|staking\s+token)/i, // 流动性质押子池（限定上下文，避免误伤 "Liquid" 命名的项目）
  /\bether\.fi\s+liquid\b/i, // ether.fi 的流动性子池
  /\blst\b|\blrt\b/i,
  /\bpooled\b/i,
  /\bindexes?\b/i, // DefiLlama 的「指数」类目，裸词 index 会误伤 Index Coop
  /\bvault\b/i,
  /\bbridge\b/i,
  /\bderivatives?\b/i,
  /\bbinance\b|\bcoinbase\b|\bokx\b|\bbybit\b|\bbitfinex\b|\bkraken\b|\bkorbit\b|\bindodax\b|\bgate\b|\bhtx\b|\bhuobi\b|\bkucoin\b/i,
  // 实测残留在 data/details 里的交易平台 / 支付机构
  /\bgemini\b|\bmexc\b|\brobinhood\b|\bbitget\b|\bbitstamp\b|\bbitvavo\b|\bbitkub\b|\bbitmex\b|\bderibit\b|\bhashkey\b|\bnexo\b|\bpoloniex\b|\bphemex\b|\bschwab\b/i,
  /\bcrypto\.com\b|\bswissborg\b|\bosl\b|\bweex\b|\bbingx\b/i,
];

/**
 * 已核实的豁免名单：名字命中排除规则，但确认是真实空投项目。
 *
 * 为什么需要它，而不是把规则改松：
 *   `Index Coop` 名字里含 `index`，与 DefiLlama 的「指数类目」同名，
 *   但它是真实的指数协议、有自己的空投叙事。
 *   把 `index` 从规则里删掉会让那批真正的「指数代币」漏拦；
 *   保留规则 + 登记豁免，才能两者兼得。
 *
 * 维护约束：
 *   1. 只登记**已人工核实**是真实空投项目、且确实被误伤的条目；
 *   2. 每条必须写理由，禁止把这里当成「误删垃圾桶」；
 *   3. 豁免只按 slug 生效，不做模糊匹配 —— 避免豁免范围意外扩大。
 */
const KNOWN_REAL_PROJECT_SLUGS = new Set([
  'index-coop', // 真实指数协议；名字含 index 但非「指数类目」
  'vault-street', // 真实收益协议；名字含 vault 但非「金库子池」
]);

/**
 * 类目级别的排除规则（**强规则**：只覆盖确定不存在空投语义的类目）。
 *
 * 为什么要单独看类目：`DefiLlama` 的协议名未必带 "CEX" 字样，
 * 但 `category` 一定是 "CEX"。只按 name 过滤会漏掉一部分。
 *
 * ⚠️ 为什么这个数组只留两类（2026-09-16 独立审查的否决结论）：
 *   我曾把 Bridge / Liquid Staking / Restaking / Wrapped / Yield Aggregator /
 *   Risk Curators 等 14 类一并加进来「补全规则」，理由是
 *   「桥与质押衍生品本身没有空投叙事」。
 *   审查用真实数据否决了这个前提：
 *     · `LayerZero`（Bridge）**已发 ZRO 空投**且库里是 `claim_live`；
 *     · `EigenLayer` / `EigenCloud`（Restaking）发过 6000 万美元空投；
 *     · `Lido` / `Rocket Pool` / `Stader` / `Kelp` / `Babylon`（LST/LRT）都有空投叙事；
 *     · `Yearn Finance`（Yield Aggregator）同样发过。
 *   按 DefiLlama 全量（TVL ≥ $5M，845 条）实跑：14 类规则会把选中集从
 *   682 条砍到 458 条，**净排除 224 条**，且 13 个类目被整类清空。
 *   「桥不发空投」这个前提本身就是错的，所以不能按类目一刀切。
 *
 * 结论：**只有「类目本身就等于非项目」的两类**才留在强规则里
 * （CEX / 中心化平台 —— 它们不是「一个可参与的活动」，而是交易场所）。
 * 其余「弱类目」（桥 / LST / 聚合器等）改由 `EXCLUDE_WEAK_CATEGORY_PATTERNS`
 * 表达，并且**只在同时缺少空投叙事证据时**才排除（见 classifyNonAirdrop）。
 */
export const EXCLUDE_CATEGORY_PATTERNS: RegExp[] = [/^cex$/i, /^centralized/i];

/**
 * 「弱类目」：这类协议**通常**不是可直接参与的空投活动
 * （LST 子池凭证、包装资产、策略金库、桥的基础设施部分），
 * 但**确实存在**同类项目发空投的先例（LayerZero / EigenLayer / Yearn…）。
 *
 * 因此它们**不能单独构成排除理由**，必须叠加「没有空投叙事证据」
 * 才判为排除 —— 证据包括：
 *   · 来源侧明确给出了活动状态（confirmed / claim_live）；
 *   · 文案里出现空投 / 领取 / 资格等叙事关键词；
 *   · 已经登记在人工档案里（说明有人核实过它确有活动）。
 *
 * 换句话说：弱类目只用来「降低默认权重」，不用来「一刀切掉」。
 */
export const EXCLUDE_WEAK_CATEGORY_PATTERNS: RegExp[] = [
  /^bridge$/i,
  /^canonical bridge$/i,
  /^liquid staking$/i,
  /^liquid restaking$/i,
  /^restaking$/i,
  /^restaked btc$/i,
  /^staking pool$/i,
  /^wrapped/i,
  /^yield aggregator$/i,
  /^farm$/i,
  /^anchor btc$/i,
  /^decentralized btc$/i,
  /^risk curators?$/i,
  /^onchain capital allocator$/i,
];

/**
 * 「有真实空投叙事」的证据判定。
 *
 * 为什么必须有这一层：弱类目规则若不叠加证据判定，
 * 就会把 LayerZero / EigenLayer 这类**已经发过空投**的项目整类误杀。
 * 判据刻意从宽（宁可保留、不可误删）：只要文案或状态里出现任意一条
 * 空投相关信号，就不再按弱类目排除。
 */
const AIRDROP_NARRATIVE = [
  /空投/,
  /airdrop/i,
  /领取/,
  /claim/i,
  /资格/,
  /eligib/i,
  /积分/,
  /points?/i,
  /代币领取/,
  /TGE/i,
];

export function hasAirdropNarrative(input: {
  status?: string;
  tagline?: string;
  tasks?: string[];
  requirements?: string[];
}): boolean {
  // 来源侧明确给出「已确认 / 可领取」状态 = 最强证据
  if (input.status === 'confirmed' || input.status === 'claim_live') return true;
  const text = [input.tagline, ...(input.tasks ?? []), ...(input.requirements ?? [])]
    .filter(Boolean)
    .join(' ');
  return AIRDROP_NARRATIVE.some((re) => re.test(text));
}

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

/** slug 化（与 normalize 的 slugify 同口径：小写 + 非字母数字转连字符） */
function slugifyLite(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 综合名称与类目给出判定。
 *
 * 判定顺序（从严到宽）：
 *   1. 人工豁免名单 —— 已核实是真实空投项目，直接放行；
 *   2. **强类目**（CEX / 中心化）—— 不是「可参与的活动」，直接排除；
 *   3. **空投叙事证据** —— 只要来源给了 confirmed/claim_live 状态、
 *      或文案里出现空投 / 领取 / 资格 / 积分等信号，一律保留
 *      （LayerZero / EigenLayer 这类「弱类目 + 真实空投」靠这一步救回）；
 *   4. 名称规则 —— 交易所 / 包装资产 / 质押衍生品的**具体条目**；
 *   5. **弱类目** —— 仅在没有空投叙事证据时才排除。
 */
export function classifyNonAirdrop(input: {
  name: string;
  categoryText?: string;
  /** 来源侧状态，`confirmed` / `claim_live` 视为「确有活动」 */
  status?: string;
  /** 用户可见文案，用于判定是否存在空投叙事 */
  tagline?: string;
  tasks?: string[];
  requirements?: string[];
}): NonAirdropVerdict {
  const name = (input.name ?? '').trim();
  const category = (input.categoryText ?? '').trim();

  // 1) 已核实的豁免优先：避免规则误伤真实项目
  if (KNOWN_REAL_PROJECT_SLUGS.has(slugifyLite(name))) {
    return { excluded: false };
  }

  // 2) 强类目：交易所不是「一个可参与的活动」
  for (const re of EXCLUDE_CATEGORY_PATTERNS) {
    if (re.test(category)) {
      return {
        excluded: true,
        reason: `类目为「${category}」（交易所 / 中心化平台，不是可参与的空投活动）`,
        pattern: re.source,
      };
    }
  }

  // 3) 空投叙事证据：有证据就不按类目排除
  //    （只有明确证据才走到这里；无证据时后面的弱类目规则才有机会生效）
  const narrative = hasAirdropNarrative(input);
  if (narrative) return { excluded: false };

  // 4) 名称规则：交易所 / 包装资产 / 质押衍生品的具体条目
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

  // 5) 弱类目：仅在没有空投叙事证据时才排除
  for (const re of EXCLUDE_WEAK_CATEGORY_PATTERNS) {
    if (re.test(category)) {
      return {
        excluded: true,
        reason: `类目为「${category}」且未发现任何空投叙事证据（无已确认状态 / 无领取相关文案），按基础设施或子池凭证处理`,
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
