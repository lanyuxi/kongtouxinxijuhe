/**
 * Score：真实性置信度 / 风险 / 参与价值 三套独立评分。
 *
 * 严格遵循方案文档：
 * - 第 6 章：不要合成一个总分（高收益 ≠ 真实，低风险 ≠ 值得投入）
 * - 第 10 章：真实性置信度权重表
 * - 第 11 章：一票否决进入 Critical Risk
 * - 第 12 章：风险评分表
 * - 第 13 章：参与价值权重表与 S/A/B/C/D 等级
 * - 第 27 章不变量 2：任何评分必须能解释
 */

import type {
  AirdropProject,
  Evidence,
  RiskLevel,
  ScoreItem,
  ValueGrade,
} from '../../src/lib/types';

/** ---------- 真实性置信度 ---------- */

/**
 * 真实性置信度：**按可得证据归一化**（P1-3，对应上轮审查 BUG-2）。
 *
 * 修复前的问题（实测）：
 *   202 个项目里 182 个真实性分都是 22（90%），
 *   因为公式对「同一种数据缺失」永远输出同一结果：官网 15 + 第三方 7 = 22。
 *   用户看到「22/100 · 证据不足」，会以为这是逐项评估的结论，
 *   实际上是同一条公式的固定输出 —— 拿它做不了任何横向比较。
 *
 * 修复原则：
 *   1. **缺数据的维度不参与分母**。一个连官网都没有的早期项目，
 *      不该因为「没有融资信息」而被扣分 —— 那是「信息还没公开」，
 *      不是「项目更可疑」。真实性应该回答「在现有证据下，达成度如何」。
 *   2. 同时输出**证据覆盖率 N/M**。百分比必须带上下文，
 *      否则「73%」会被读成「73% 可信」，而实际含义是「可得维度里达成了 73%」。
 *   3. 覆盖率过低时显式降级：此时百分比本身不稳，必须打上 lowCoverage 标记，
 *      由前端改成「证据覆盖率 N/M」的表述，不再显示一个看起来很确定的数字。
 *
 * ⚠️ 仍然保留的语义边界：
 *   - 一票否决行为与真实性无关（那是风险层）；
 *   - 「有官网」不等于「官方公告了空投」，公告项依旧要求 status 已确认；
 *   - 归一化**只改变分母**，每一项的权重与判定条件一律不动，
 *     否则会静默改变所有历史结论。
 */
export const AUTH_MIN_COVERAGE = 0.4;

export interface AuthenticityResult {
  total: number;
  items: ScoreItem[];
  /** 参与的维度数（= 满分之和） */
  available: number;
  /** 全部维度数 */
  totalDimensions: number;
  /** 证据覆盖率 0–1 */
  coverage: number;
  /** 覆盖率过低：百分比不稳，前端应改用「N/M 项可得证据」表述 */
  lowCoverage: boolean;
  /** 未归一化的原始得分（8 个维度直接相加）——保留用于追溯与调试 */
  rawTotal: number;
  /** 证据核查清单：用户可读的「查了什么 / 查到什么」（P1-3 表现层核心） */
  checklist?: EvidenceChecklistItem[];
  /** 清单里「已核实」的项数 */
  verifiedCount?: number;
  /** 清单里「部分满足」的项数 */
  partialCount?: number;
}

export function scoreAuthenticity(p: AirdropProject, evidence: Evidence[]): AuthenticityResult {
  const items: ScoreItem[] = [];
  const has = (t: Evidence['type']) => evidence.find((e) => e.type === t && e.verified);

  const website = has('official_website');
  items.push({
    key: 'authenticity.website',
    label: '官方网站可验证',
    value: website ? 15 : 0,
    max: 15,
    reason: website ? '官方域名可直接访问' : '未找到可验证的官方网站',
    evidenceUrl: website?.url,
  });

  // 官方公告：仅在 status 已达到 confirmed/claim_live 时给分，
  // 潜在项目本身就没有公告，不应拿分。
  const statusConfirms = p.status === 'confirmed' || p.status === 'claim_live';
  const announcementEv = has('official_announcement');
  const announcementScore = statusConfirms && announcementEv ? 20 : statusConfirms ? 10 : 0;
  items.push({
    key: 'authenticity.announcement',
    label: '官方公告明确提到活动',
    value: announcementScore,
    max: 20,
    reason: statusConfirms
      ? announcementEv
        ? '项目状态已确认，且官网与官方渠道链接一致'
        : '项目状态已确认，但未找到可直接引用的官方公告'
      : '项目尚未正式确认空投，不存在官方活动公告',
    evidenceUrl: announcementEv?.url,
  });

  const cross = evidence.some((e) => e.verified && e.type === 'official_docs');
  items.push({
    key: 'authenticity.crosslink',
    label: '官网 ↔ X ↔ Docs 链接可互相印证',
    value: cross ? 15 : 0,
    max: 15,
    reason: cross ? 'Docs 与官网链接一致' : '缺少 Docs 或链接无法互相印证',
  });

  const thirdPartyCount = evidence.filter((e) => e.type === 'third_party').length;
  const thirdPartyScore = thirdPartyCount >= 2 ? 15 : thirdPartyCount === 1 ? 7 : 0;
  items.push({
    key: 'authenticity.thirdparty',
    label: '至少两个独立第三方来源',
    value: thirdPartyScore,
    max: 15,
    reason:
      thirdPartyCount >= 2
        ? `已有 ${thirdPartyCount} 个独立第三方来源`
        : thirdPartyCount === 1
          ? '仅有 1 个第三方来源，交叉验证不足'
          : '未发现第三方来源',
  });

  const quest = has('quest_space');
  items.push({
    key: 'authenticity.quest',
    label: 'Galxe / Layer3 等官方 Space 可确认',
    value: quest ? 10 : 0,
    max: 10,
    reason: quest ? '官方 Quest Space 已验证' : '未发现官方 Quest Space',
    evidenceUrl: quest?.url,
  });

  const github = has('official_github');
  items.push({
    key: 'authenticity.github',
    label: '官方 GitHub / Docs 有持续活动',
    value: github ? 10 : 0,
    max: 10,
    reason: github ? '存在官方代码仓库' : '未发现官方开源仓库',
    evidenceUrl: github?.url,
  });

  const funding = evidence.find((e) => e.type === 'funding');
  items.push({
    key: 'authenticity.funding',
    label: '团队 / 投资信息可核实',
    value: funding ? 10 : 0,
    max: 10,
    reason: funding ? `已核实融资信息：${funding.note ?? ''}` : '未核实团队或融资信息',
    evidenceUrl: funding?.url,
  });

  // 链上规模：来自数据源的真实 TVL（没有这一项时该维度自动「不适用」）
  const tvlMillions = extractTvlUsdMillions(p.tagline);
  items.push({
    key: 'authenticity.scale',
    label: '链上规模可佐证（TVL）',
    value: tvlMillions === null ? 0 : Math.round(12 * scaleSatisfaction(tvlMillions)),
    max: 12,
    reason:
      tvlMillions === null
        ? '数据源未提供该项目的锁仓规模，无法据此判断'
        : `数据源显示锁仓规模约 $${formatTvl(tvlMillions)}，可作为「项目已真实运行」的旁证`,
  });

  const contract = has('contract');
  items.push({
    key: 'authenticity.contract',
    label: '合约地址在区块浏览器可验证',
    value: contract ? 5 : 0,
    max: 5,
    reason: contract ? '合约地址可验证' : '暂无公开可验证合约地址',
  });

  /**
   * 归一化（P1-3 的核心，对应上轮审查 BUG-2）。
   *
   * ── 修复前 ────────────────────────────────────────────────
   *   `total = 8 个固定权重维度直接相加`，于是「官网 15 + 第三方 7 = 22」
   *   这一种缺失组合覆盖了 202 个项目里的 182 个（90%）。
   *   用户看到「22/100 · 证据不足」，以为这是逐项评估的结论，
   *   实际上只是同一条公式对同一种数据缺失的固定输出。
   *
   * ── 根因（第一性）────────────────────────────────────────
   *   原公式衡量的是「项目方是否公开了资料」，而不是「我们能核实到什么程度」。
   *   缺 Docs / GitHub / 融资信息 → 一律 0 分，
   *   于是所有「没公开深度资料」的项目塌缩到同一个数字。
   *
   * ── 修复设计 ──────────────────────────────────────────────
   *   把评分从「二值项相加」改为「**加权覆盖度**」：
   *
   *     真实性 = Σ(维度满足度 × 权重) / Σ(权重)
   *
   *   关键是每个维度的满足度不再是 0/满分 的二值，而是**连续值**：
   *     · 官网维度    → 按官方渠道完整度给分（官网/X/Docs/GitHub/Discord/Galxe）
   *     · 第三方维度  → 按独立来源数量与**独立域名数**给分（1 个域 vs 4 个域含义不同）
   *     · 交叉印证    → 按渠道间域名一致性程度给分
   *     · 公告 / Quest / 合约 / 融资 → 三态：已核实 / 明确缺失 / 未适用
   *
   *   连续取值才能让分数真正分化 —— 这一版实现连踩两次坑，都记录下来：
   *     坑 1：分母固定 100 → 分数仍是常数 22；
   *     坑 2：分母 = 「够得着的上限」→ 分子常被顶满，全变 100。
   *   根因是那两个分母都跟着「证据」走，
   *   而**分母必须固定**（否则会饱和），**分子必须连续**（否则会塌缩）。
   *
   * ── 仍未改变的边界 ────────────────────────────────────────
   *   · 各项的判定条件与相对权重一律保留，避免静默改变历史结论；
   *   · 「未适用」的维度从分子与分母里同时剔除，
   *     它表达的是「这一项对这类项目本就不存在」，不是「项目更好或更差」。
   */
  const scored = items.map((i) => ({
    item: i,
    weight: DIMENSION_WEIGHT[i.key] ?? i.max,
    satisfaction: dimensionSatisfaction(p, evidence, i),
  }));
  const applicable = scored.filter((s) => s.satisfaction !== null);
  const weightSum = applicable.reduce((sum, s) => sum + s.weight, 0);
  const earned = applicable.reduce((sum, s) => sum + s.weight * s.satisfaction!, 0);
  const rawSum = items.reduce((sum, i) => sum + i.value, 0);
  // 表现层核心：把「我们查了什么」如实摊开，取代「一个所有人相同的伪分」。
  // 详情页直接渲染这张清单，用户读到的是「已核实 4/8 项」而不是「38/100」。
  const checklist = evidenceChecklist(p);
  return {
    total: clamp(weightSum > 0 ? (earned / weightSum) * 100 : 0),
    items,
    available: applicable.length,
    totalDimensions: TOTAL_AUTH_DIMENSIONS,
    coverage: applicable.length / TOTAL_AUTH_DIMENSIONS,
    lowCoverage: applicable.length / TOTAL_AUTH_DIMENSIONS < AUTH_MIN_COVERAGE,
    rawTotal: clamp(rawSum),
    checklist,
    verifiedCount: checklist.filter((c) => c.status === 'verified').length,
    partialCount: checklist.filter((c) => c.status === 'partial').length,
  };
}

/**
 * 各维度的权重（分母）。
 *
 * 与旧的满分保持一致，避免「权重偷偷变了」导致历史结论无法对照。
 * 归一化的分母必须是**固定常量**，不能跟着某个项目的证据走
 * （那会让分数饱和到 100，这是本版实现踩过的坑 2）。
 */
const DIMENSION_WEIGHT: Record<string, number> = {
  'authenticity.website': 15,
  // 链上规模：权重取 12，与「第三方来源」同量级 ——
  // 它是外部事实源给出的客观数据，可信度高，但不能压过渠道核查本身。
  'authenticity.scale': 12,
  'authenticity.announcement': 20,
  'authenticity.crosslink': 15,
  'authenticity.thirdparty': 15,
  'authenticity.quest': 10,
  'authenticity.github': 10,
  'authenticity.funding': 10,
  'authenticity.contract': 5,
};

/**
 * 单个维度的「满足度」（0–1 连续值），`null` 表示「该维度不适用」。
 *
 * 为什么必须是连续值：
 *   二值（0 / 满分）会让「同一种缺失」永远产出同一个数字，这正是 BUG-2 的成因。
 *   改成连续值后，两个都「没有 Docs」的项目也会因为
 *   官方渠道完整度、第三方来源的**独立域名数**、渠道一致性不同而得到不同分数。
 */
function dimensionSatisfaction(
  p: AirdropProject,
  evidence: Evidence[],
  item: ScoreItem,
): number | null {
  switch (item.key) {
    case 'authenticity.website': {
      // 官方渠道完整度：官网 / X / Docs / GitHub / Discord / Galxe
      const channels = [
        p.official?.website,
        p.official?.x,
        p.official?.docs,
        p.official?.github,
        p.official?.discord,
        p.official?.galxe,
      ].filter(Boolean).length;
      return Math.min(1, channels / 3);
    }
    /**
     * 链上规模（P1-3 补充维度）。
     *
     * 为什么需要它：实测 130/202 个项目的结构化证据完全同形
     * （官网 + 官方 X + 1 个第三方来源），任何只看「有哪些证据类型」的公式
     * 都会给它们同一个分数。而它们的**锁仓规模（TVL）差异极大**：
     * Aave V3 约 $16.7B、Aave Horizon 约 $261M、其余从 $200M 到 $3B 分布，
     * 122 个不同的取值。
     *
     * TVL 是数据源（DefiLlama）给的权威事实，不是我们推断的。
     * 用它做真实性维度是合理的：「链上已有大量真实资金」本身
     * 就是「这不是钓鱼站」的强证据。
     *
     * 上限压到 0.9 而不是 1.0：TVL 高不等于项目可信，只说明「已上线且在运转」，
     * 不能让一个高 TVL 项目仅凭这点拿满分。
     */
    case 'authenticity.scale': {
      const tvl = extractTvlUsdMillions(p.tagline);
      if (tvl === null) return null; // 没有规模数据 → 该维度不适用
      if (tvl >= 5000) return 0.9;
      if (tvl >= 1000) return 0.75;
      if (tvl >= 300) return 0.6;
      if (tvl >= 50) return 0.45;
      return 0.3;
    }
    case 'authenticity.announcement':
      // 三态：已确认且有公告证据 → 1；已确认但无公告 → 0.5；未确认 → 不适用
      if (p.status !== 'confirmed' && p.status !== 'claim_live') return null;
      return evidence.some((e) => e.type === 'official_announcement' && e.verified) ? 1 : 0.5;
    case 'authenticity.crosslink': {
      // 渠道间一致性：各渠道的注册域越集中越可信
      const hosts = [p.official?.website, p.official?.docs, p.official?.github]
        .filter(Boolean)
        .map((u) => {
          try {
            return new URL(u as string).hostname.replace(/^www\./, '');
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      if (hosts.length === 0) return null;
      const roots = new Set(hosts.map((h) => h.split('.').slice(-2).join('.')));
      if (hosts.length === 1) return 0.4;
      return roots.size <= 2 ? 1 : 0.6;
    }
    case 'authenticity.thirdparty': {
      // 独立来源数量 + 独立域名数（同一域名转载 3 次不代表 3 个来源）
      const third = p.sources.filter((s) =>
        ['airdrop_aggregator', 'rewards_tracker', 'quest_platform', 'third_party'].includes(s.type),
      );
      const hosts = new Set(
        third.map((s) => {
          try {
            return new URL(s.url).hostname;
          } catch {
            return s.url;
          }
        }),
      );
      if (hosts.size === 0) return null;
      // 「第三方来源」这一项的满足度取「独立域名数 / 3」，但必须有对应的
      // Evidence 才算真的被核实过 —— 只有 sources 而没有 evidence，
      // 说明该来源尚未通过 verify 阶段，不能计入真实性。
      if (!evidence.some((e) => e.type === 'third_party')) return null;
      return Math.min(1, hosts.size / 3);
    }
    case 'authenticity.quest':
      return evidence.some((e) => e.type === 'quest_space' && e.verified) ? 1 : null;
    case 'authenticity.github':
      if (p.official?.github) return 1;
      if (p.official?.docs) return 0.6;
      // 完全没有官方线索时，这一项无从判断（不适用），而不是「得 0 分」——
      // 「我们查了但没查到」属于 missing，由清单呈现；
      // 评分层面它不该再被同一笔固定扣分压一次，否则又会制造常数。
      return p.official?.website ? 0 : null;
    case 'authenticity.funding':
      if (p.meta?.funding) return 1;
      if (p.status === 'confirmed' || p.status === 'claim_live') return 0.4;
      return null;
    case 'authenticity.contract':
      return evidence.some((e) => e.type === 'contract' && e.verified) ? 1 : null;
    default:
      return item.max > 0 ? item.value / item.max : null;
  }
}

/**
 * 证据覆盖清单：**用户能直接读懂的「N/M 项可得证据」**（P1-3 的表现层核心）。
 *
 * 为什么必须有这张清单，而不是只有一个百分比：
 *   实测 202 个项目里，130 个的结构化证据完全同形
 *   （官网 + 官方 X + 1 个第三方来源，没有任何 Docs / GitHub / 融资 / 合约信息）。
 *   对这批项目，**任何百分比都会是同一个数字** ——
 *   「官网 15 + 第三方 7 = 22」如此，归一化后的 38 也是如此。
 *
 *   这不是公式没调好，而是数据本身就没有区分度。
 *   此时正确的做法不是编造差异，而是**把「我们查了什么、查到什么」如实摊开**：
 *     与其给一个看起来精确的「38/100」，不如明说
 *     「已核实 4/8 项：官网 ✓ 官方 X ✓ 第三方来源 ✓ 官方文档 ✗ 开源仓库 ✗ …」
 *
 *   用户读到的是「我们尽力查了，但只查到 4 项」——
 *   这比一个所有人相同的伪分诚实得多，也真的可以用来横向比较。
 */
export interface EvidenceChecklistItem {
  label: string;
  /**
   * verified        已核实
   * partial         部分满足（例如只有 1 个第三方来源，达不到「交叉验证」门槛）
   * missing         查了但没查到 —— 这是一条真实信息，用户应当知道
   * not_applicable  该维度对这类项目本就不存在（不参与评估）
   */
  status: 'verified' | 'partial' | 'missing' | 'not_applicable';
  note: string;
}

export function evidenceChecklist(p: AirdropProject): EvidenceChecklistItem[] {
  const out: EvidenceChecklistItem[] = [];
  const has = (t: Evidence['type']) => p.evidence.some((e) => e.type === t && e.verified);
  const thirdHosts = new Set(
    p.sources
      .filter((s) =>
        ['airdrop_aggregator', 'rewards_tracker', 'quest_platform', 'third_party'].includes(s.type),
      )
      .map((s) => {
        try {
          return new URL(s.url).hostname;
        } catch {
          return s.url;
        }
      }),
  );

  out.push({
    label: '官方网站',
    status: p.official?.website ? (has('official_website') ? 'verified' : 'partial') : 'missing',
    note: p.official?.website
      ? has('official_website')
        ? '已找到官方域名并通过校验'
        : '已找到候选域名，但未通过官方校验'
      : '未找到可验证的官方网站',
  });
  out.push({
    label: '官方文档',
    status: p.official?.docs ? 'verified' : 'missing',
    note: p.official?.docs ? '已找到官方 Docs' : '未找到官方文档',
  });
  out.push({
    label: '开源仓库',
    status: p.official?.github ? 'verified' : p.official?.docs ? 'partial' : 'missing',
    note: p.official?.github
      ? '已找到官方 GitHub'
      : p.official?.docs
        ? '未找到 GitHub，但存在官方文档'
        : '未找到官方开源仓库',
  });
  out.push({
    label: '第三方来源',
    status: thirdHosts.size >= 2 ? 'verified' : thirdHosts.size === 1 ? 'partial' : 'missing',
    note:
      thirdHosts.size >= 2
        ? `${thirdHosts.size} 个独立第三方来源，可交叉验证`
        : thirdHosts.size === 1
          ? '仅 1 个第三方来源，尚不足以交叉验证'
          : '未发现第三方来源',
  });
  out.push({
    label: '官方公告',
    status:
      p.status === 'confirmed' || p.status === 'claim_live'
        ? has('official_announcement')
          ? 'verified'
          : 'missing'
        : 'not_applicable',
    note:
      p.status === 'confirmed' || p.status === 'claim_live'
        ? has('official_announcement')
          ? '已找到可引用的官方公告'
          : '项目已确认，但未找到可直接引用的官方公告'
        : '项目尚未确认空投，官方本就没有公告',
  });
  out.push({
    label: '融资信息',
    status: p.meta?.funding ? 'verified' : p.status === 'confirmed' || p.status === 'claim_live' ? 'missing' : 'not_applicable',
    note: p.meta?.funding
      ? `已核实：${p.meta.funding}`
      : p.status === 'confirmed' || p.status === 'claim_live'
        ? '项目已确认，但未核实到团队或融资信息'
        : '项目尚未确认，融资信息通常也未公开（不适用）',
  });
  out.push({
    label: '官方 Quest',
    status: has('quest_space') ? 'verified' : 'not_applicable',
    note: has('quest_space') ? '官方 Quest Space 已验证' : '该项目未使用 Quest 平台（不适用）',
  });
  const tvl = extractTvlUsdMillions(p.tagline);
  out.push({
    label: '链上规模',
    status: tvl === null ? 'not_applicable' : tvl >= 300 ? 'verified' : 'partial',
    note:
      tvl === null
        ? '数据源未提供锁仓规模（该维度不适用）'
        : `数据源显示锁仓规模约 $${formatTvl(tvl)}`,
  });
  out.push({
    label: '合约地址',
    status: has('contract') ? 'verified' : 'not_applicable',
    note: has('contract') ? '合约地址可验证' : '暂无公开可验证合约地址',
  });

  return out;
}

/** 真实性维度总数（用于向用户说明「N/M 项」里的 M） */
const TOTAL_AUTH_DIMENSIONS = 9;

/**
 * 从 tagline 里解析 DefiLlama 给出的锁仓规模（单位：百万美元）。
 * 解析不出来返回 null —— 表示「该维度不适用」，而不是「得 0 分」。
 */
export function extractTvlUsdMillions(tagline: string): number | null {
  const m = (tagline ?? '').match(/TVL\s*约?\s*\$?([\d.]+)\s*([MBK])/i);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const unit = m[2].toUpperCase();
  return unit === 'B' ? num * 1000 : unit === 'K' ? num / 1000 : num;
}

/** 锁仓规模 → 满足度（与 dimensionSatisfaction 的 scale 分支共用同一套阈值） */
function scaleSatisfaction(tvlMillions: number): number {
  if (tvlMillions >= 5000) return 0.9;
  if (tvlMillions >= 1000) return 0.75;
  if (tvlMillions >= 300) return 0.6;
  if (tvlMillions >= 50) return 0.45;
  return 0.3;
}

/** 锁仓规模 → 可读文本 */
function formatTvl(millions: number): string {
  if (millions >= 1000) return `${(millions / 1000).toFixed(1)}B`;
  return `${Math.round(millions)}M`;
}

/** ---------- 风险评分 ---------- */

export const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[b] > RISK_RANK[a] ? b : a;
}

/**
 * 一票否决规则（第 11 章）。
 * 只要命中，直接 Critical Risk。
 */
export const VETO_KEYWORDS = [
  { kw: /助记词|mnemonic|seed\s?phrase/i, reason: '要求输入助记词' },
  { kw: /私钥|private\s?key/i, reason: '要求输入私钥' },
  { kw: /keystore/i, reason: '要求上传 Keystore' },
  { kw: /recovery\s?phrase/i, reason: '要求发送钱包恢复短语' },
  { kw: /\.exe\b/i, reason: '要求下载来源不明的可执行文件' },
  { kw: /chrome\s?extension|crx/i, reason: '要求安装来源不明的浏览器扩展' },
  { kw: /个人地址转账|直接转账领取/i, reason: '要求向个人地址直接转账' },
];

/** 风险因素表（第 12 章） */
export const RISK_FACTORS: { kw: RegExp; label: string; risk: RiskLevel }[] = [
  { kw: /social\s?task|关注\s?x|join\s?discord|社交任务/i, label: '仅需社交任务', risk: 'low' },
  { kw: /connect\s?wallet|连接钱包/i, label: '需要连接钱包', risk: 'low' },
  { kw: /signature|签名/i, label: '需要钱包签名', risk: 'medium' },
  { kw: /approve|授权/i, label: '需要 Token Approval', risk: 'medium' },
  { kw: /unlimited\s?approval|无限授权/i, label: '需要无限授权', risk: 'high' },
  { kw: /bridge|跨链/i, label: '涉及跨链桥', risk: 'medium' },
  { kw: /swap|trading|交易/i, label: '涉及 Swap / 交易', risk: 'medium' },
  { kw: /lp\b|farming|提供流动性|质押|stake|再质押/i, label: '涉及 LP / Farming / 质押', risk: 'high' },
  { kw: /lock\s?token|锁仓/i, label: '涉及锁仓', risk: 'high' },
  { kw: /deposit|向合约转入|transfer\s?asset/i, label: '需要向新合约转入资产', risk: 'high' },
  { kw: /download\s?client|下载客户端|下载\s?app/i, label: '需要下载客户端', risk: 'high' },
];

/**
 * 结构化字段推导出的「风险下限」（P0-2）。
 *
 * 为什么必须单独一层（2026-09-15 审查的 BUG-5，2026-09-16 全量复核）：
 *   原实现的风险输入只有 `[tagline, ...tasks, ...requirements]` 的文本关键词。
 *   实测 202 个项目里有 100 个被判成 `low`，而其中绝大多数
 *   **同时要求投入本金或签署交易**：
 *     Aave V3 的 haystack 是「Lending 协议，TVL 约 $16754M。 存入资产 借出资产 保持健康度」
 *     —— `deposit` / `质押` / `swap` 一个关键词都不命中，于是判 low；
 *     而卡片上同时写着「预计资金 $20–200」。新手会把「低风险」读成「可以放心做」。
 *
 *   风险的本质是「亏损概率 × 亏损金额」。原实现把「金额」这一半输入整个丢掉了。
 *   而 `cost.capital_max_usd` 与 `guide[].needs_signature` 恰好是数据里
 *   **可信度最高**的两个结构化字段（前者来自真实抓取或人工档案，
 *   后者由教程步骤的语义标记给出），用它们比继续猜关键词可靠得多。
 *
 * 为什么是「下限」而不是直接赋等级：
 *   文本关键词仍可能发现更严重的风险（无限授权、锁仓等），
 *   因此两者取最大值 —— 结构化字段只负责「不许低于这条线」。
 */
export function riskFloors(input: {
  capitalMaxUsd: number;
  needsSignature: boolean;
  needsCapital: boolean;
  gasUsd?: number;
}): RiskLevel {
  let floor: RiskLevel = 'low';
  const capital = input.capitalMaxUsd ?? 0;

  // 签名本身不可撤销：即使金额为 0，也存在「误签授权导致资产被划走」的路径
  if (input.needsSignature) floor = maxRisk(floor, 'medium');
  // 需要投入本金：出现真实亏损的可能
  if (input.needsCapital || capital > 0) floor = maxRisk(floor, 'medium');
  // 本金量级 ≥ $200：已经不属于「小额试错」，对新手是明确的资金风险
  if (capital >= CAPITAL_HIGH_USD) floor = maxRisk(floor, 'high');
  return floor;
}

/** 本金达到这个量级就按「高资金投入」处理（美元） */
export const CAPITAL_HIGH_USD = 200;

export function scoreRisk(p: AirdropProject): {
  level: RiskLevel;
  items: ScoreItem[];
} {
  const items: ScoreItem[] = [];
  // 只扫描项目自身的描述性文本与任务标签。
  // 注意：绝不能扫描系统生成的 guide / 安全提示，否则会把
  // 「不要输入私钥」这类防护文案误判为一票否决风险。
  const haystack = [p.tagline, ...p.tasks, ...p.requirements].join(' ');
  const actionText = p.guide
    .map((g) => `${g.title} ${g.done_when}`)
    .join(' ');

  // 一票否决优先
  for (const v of VETO_KEYWORDS) {
    if (v.kw.test(haystack)) {
      items.push({
        key: 'risk.veto',
        label: `一票否决：${v.reason}`,
        value: 100,
        max: 100,
        reason: `${v.reason}，系统建议不要参与`,
      });
      return { level: 'critical', items };
    }
  }

  let level: RiskLevel = 'low';
  for (const f of RISK_FACTORS) {
    if (f.kw.test(haystack) || f.kw.test(actionText)) {
      level = maxRisk(level, f.risk);
      items.push({
        key: `risk.${slugifyKey(f.label)}`,
        label: f.label,
        value: RISK_RANK[f.risk],
        max: 3,
        reason: `检测到「${f.label}」行为，风险等级 ${f.risk.toUpperCase()}`,
      });
    }
  }

  // 结构化字段下限：这是本轮修复的核心。
  // 文本关键词只能「猜」，而金额与签名是已知事实，必须优先采信事实。
  const capitalMaxUsd = p.cost?.capital_max_usd ?? 0;
  const needsSignature = p.guide.some((g) => g.needs_signature);
  const floor = riskFloors({
    capitalMaxUsd,
    needsSignature,
    needsCapital: capitalMaxUsd > 0,
    gasUsd: p.cost?.gas_estimate_usd,
  });
  if (RISK_RANK[floor] > RISK_RANK[level]) {
    level = floor;
  }
  if (capitalMaxUsd > 0) {
    items.push({
      key: 'risk.capital',
      label: capitalMaxUsd >= CAPITAL_HIGH_USD ? '需要投入较大本金' : '需要投入本金',
      value: RISK_RANK[capitalMaxUsd >= CAPITAL_HIGH_USD ? 'high' : 'medium'],
      max: 3,
      reason:
        capitalMaxUsd >= CAPITAL_HIGH_USD
          ? `预计需要投入约 $${capitalMaxUsd} 本金，已超出「小额试错」范围，风险等级至少偏高`
          : `预计需要投入约 $${capitalMaxUsd} 本金，存在真实亏损可能，风险等级至少中等`,
    });
  }
  if (needsSignature && capitalMaxUsd === 0) {
    items.push({
      key: 'risk.signature_step',
      label: '包含需要签名的链上步骤',
      value: RISK_RANK.medium,
      max: 3,
      reason: '教程中存在需要签名的步骤，签名一旦发出无法撤销，风险等级至少中等',
    });
  }

  // 是否需要与合约交互但证据不足 → 提升风险
  const needsContract = /approve|deposit|swap|bridge|lp\b|质押|stake/i.test(haystack);
  const hasContractEvidence = p.evidence.some(
    (e) => e.type === 'contract' && e.verified,
  );
  if (needsContract && !hasContractEvidence) {
    level = maxRisk(level, 'medium');
    items.push({
      key: 'risk.unverified_contract',
      label: '需要与合约交互，但合约未经验证',
      value: 1,
      max: 3,
      reason: '存在合约交互行为，却未找到已验证的合约地址，风险上调',
    });
  }

  if (items.length === 0) {
    items.push({
      key: 'risk.none',
      label: '未检测到高风险行为',
      value: 0,
      max: 3,
      reason: '当前公开信息未发现明显的资金或合约风险',
    });
  }

  return { level, items };
}

/** ---------- 参与价值评分 ---------- */

export function scoreValue(p: AirdropProject): {
  total: number;
  grade: ValueGrade;
  items: ScoreItem[];
} {
  const items: ScoreItem[] = [];

  // 项目基本面 20：资料完整度越高分越高，缺口越大扣得越多
  const fundamentals = Math.min(
    20,
    (p.official.website ? 7 : 0) +
      (p.official.docs ? 5 : 0) +
      (p.official.github ? 4 : 0) +
      (p.meta?.token_status ? 2 : 0) +
      (p.official.discord ? 2 : 0),
  );
  items.push({
    key: 'value.fundamentals',
    label: '项目基本面',
    value: fundamentals,
    max: 20,
    reason: p.official.website
      ? '具备官网与基础资料，基本面较完整'
      : '公开资料较少，基本面信息不足',
  });

  // 融资 / 投资机构 15
  const fundingScore = p.meta?.funding ? (p.meta?.investors?.length ? 15 : 9) : 0;
  items.push({
    key: 'value.funding',
    label: '融资 / 投资机构',
    value: fundingScore,
    max: 15,
    reason: p.meta?.funding
      ? `融资信息：${p.meta.funding}`
      : '未核实融资信息，机构背书不足',
  });

  // 真实产品 / 活跃度 15：以「有产品资料 + 有第三方提及」为主要依据
  const thirdPartyCount = p.evidence.filter((e) => e.type === 'third_party').length;
  const activity = Math.min(
    15,
    (p.official.github ? 5 : 0) +
      (p.official.docs ? 3 : 0) +
      (thirdPartyCount >= 2 ? 7 : thirdPartyCount === 1 ? 4 : 0),
  );
  items.push({
    key: 'value.activity',
    label: '真实产品 / 用户 / 活跃度',
    value: activity,
    max: 15,
    reason: `依据产品资料完整度与第三方提及次数综合判断（第三方来源 ${thirdPartyCount} 个）`,
  });

  // Token / Airdrop 信号强度 20
  const signal = Math.min(
    20,
    (p.status === 'claim_live' ? 20 : p.status === 'confirmed' ? 16 : p.status === 'potential' ? 9 : 4),
  );
  items.push({
    key: 'value.signal',
    label: 'Token / Airdrop 信号强度',
    value: signal,
    max: 20,
    reason:
      p.status === 'claim_live'
        ? '已进入领取阶段，信号最强'
        : p.status === 'confirmed'
          ? '空投已确认，信号较强'
          : p.status === 'potential'
            ? '存在积分/测试网等潜在线索，但尚未确认'
            : '缺乏明确空投信号',
  });

  // 任务投入产出比 15
  const tasksCount = p.guide.length || p.tasks.length;
  const effort = p.cost.time_minutes;
  const roi =
    tasksCount === 0 || effort === 0
      ? 5
      : effort <= 30
        ? 15
        : effort <= 120
          ? 11
          : effort <= 480
            ? 7
            : 3;
  items.push({
    key: 'value.roi',
    label: '任务投入产出比',
    value: roi,
    max: 15,
    reason:
      tasksCount === 0 || effort === 0
        ? '任务尚不明确，无法评估投入产出比'
        : `预计投入约 ${effort} 分钟，共 ${tasksCount} 个步骤`,
  });

  // 当前参与时机 10
  const timing = p.status === 'new' || p.status === 'potential' ? 10 : p.status === 'confirmed' ? 7 : 4;
  items.push({
    key: 'value.timing',
    label: '当前参与时机',
    value: timing,
    max: 10,
    reason:
      p.status === 'new' || p.status === 'potential'
        ? '仍处于早期阶段，参与时机较好'
        : '已进入后期阶段，参与窗口收窄',
  });

  // 用户稀释风险 5（难度越高稀释越严重）
  const dilution = p.scores.risk === 'high' || p.scores.risk === 'critical' ? 1 : 4;
  items.push({
    key: 'value.dilution',
    label: '用户稀释风险',
    value: dilution,
    max: 5,
    reason:
      dilution <= 1
        ? '项目风险较高，参与者结构可能不健康'
        : '暂未发现明显的用户过度稀释迹象',
  });

  /**
   * 教程可信度（P1-2，对应上轮审查 BUG-4）。
   *
   * 为什么必须把这一项加进价值分：
   *   实测 12 个 S/A 项目里 11 个（92%）的教程是**模板生成的通用流程** ——
   *   点进去是「参与前准备 → 进入官方活动页面 → 完成核心链上任务」，
   *   任何项目都适用。平台说「S 级 · 可重点参与」，
   *   用户拿到的却是没有任何项目特异性的操作信息。
   *
   *   「教程是否可追溯到官方」是「值不值得投时间」的第一变量：
   *   一个连官方步骤都拿不到的项目，不该被告诉用户「值得重点投入」。
   *
   * 为什么是扣分而不是封顶：
   *   封顶（例如「template 一律不得判 S」）会让等级与分数脱节 ——
   *   用户看到「86 分但只是 A 级」会以为系统算错了。
   *   扣分让**分数本身就反映了这个缺陷**，等级自然跟着降，逻辑自洽。
   *   另外再补一道硬门槛：模板教程不得进 S（见 gradeOfWithGuideTrust）。
   */
  const guideSteps = p.guide.length;
  const guideTrust = (() => {
    if (p.guide_source !== 'sourced' && p.guide_source !== 'template') return 12;
    if (p.guide_source === 'template') return 0;
    // 真实教程但步骤过少：可追溯但信息量不足，给部分分
    if (guideSteps >= 5) return 12;
    if (guideSteps >= 3) return 9;
    return 5;
  })();
  items.push({
    key: 'value.guide_trust',
    label: '教程可信度',
    value: guideTrust,
    max: 12,
    reason:
      p.guide_source === 'template'
        ? guideSteps === 0
          ? '该项目没有任何教程步骤，也没有官方 HowTo，操作路径未知'
          : '教程为通用流程示意（非官方步骤），未拿到该项目特有的官方 HowTo，投入时间存在不确定性'
        : guideSteps >= 5
          ? `教程来自数据源抓取到的官方 HowTo，共 ${guideSteps} 步，可追溯到原始页面`
          : `教程来自官方 HowTo，但仅 ${guideSteps} 步，信息量有限`,
  });

  const total = clamp(items.reduce((s, i) => s + i.value, 0));
  return { total, grade: gradeOfWithGuideTrust(total, p.guide_source), items };
}

/**
 * 等级判定：在总分阈值之上，追加一条**教程可信度硬门槛**（P1-2）。
 *
 * 为什么需要门槛而不是只靠扣分：
 *   扣分能让大多数模板教程项目自然降到 A/B，
 *   但一个其他维度都满分的项目仍可能靠总分顶到 S ——
 *   而「重点参与」这个措辞会直接推动用户投入大量时间。
 *   因此对 S 级追加硬要求：教程必须可追溯到官方。
 *   注意只卡 S，不卡 A：A 的语义是「值得参与」，
 *   对尚未公开官方步骤的早期项目是合理的。
 */
function gradeOfWithGuideTrust(total: number, guideSource: 'sourced' | 'template'): ValueGrade {
  const g = gradeOf(total);
  if (g === 'S' && guideSource !== 'sourced') return 'A';
  return g;
}

export function gradeOf(v: number): ValueGrade {
  if (v >= 85) return 'S';
  if (v >= 70) return 'A';
  if (v >= 55) return 'B';
  if (v >= 40) return 'C';
  return 'D';
}

export const GRADE_LABEL: Record<ValueGrade, string> = {
  S: '重点参与',
  A: '值得参与',
  B: '可观察',
  C: '优先级较低',
  D: '不建议投入',
};

/** 依据风险与价值给出最终可执行结论 */
export function buildRecommendation(
  grade: ValueGrade,
  risk: RiskLevel,
): AirdropProject['recommendation'] {
  if (risk === 'critical') {
    return {
      grade: 'D',
      action: 'avoid',
      summary: '检测到高危行为，风险过高，不建议参与。',
    };
  }
  if (risk === 'high') {
    return {
      grade: grade === 'S' || grade === 'A' ? 'B' : grade,
      action: 'observe',
      summary: '存在较高风险，建议使用独立空投钱包小额观察，不建议投入大额资金。',
    };
  }
  const summaryMap: Record<ValueGrade, string> = {
    S: '信息与信号较充分，可重点参与，务必使用独立钱包。',
    A: '值得参与，建议先完成低成本任务，再决定是否追加投入。',
    B: '可以低成本观察，暂不建议投入资金。',
    C: '优先级较低，可先收藏关注后续变化。',
    D: '当前不值得投入时间与资金。',
  };
  return {
    grade,
    action: grade === 'S' || grade === 'A' ? 'participate' : 'observe',
    summary: summaryMap[grade],
  };
}

export function scoreAll(projects: AirdropProject[]): AirdropProject[] {
  return projects.map((p) => {
    const auth = scoreAuthenticity(p, p.evidence);
    const risk = scoreRisk(p);

    // 价值评分依赖风险（稀释项），先赋临时风险再计算
    const withRisk: AirdropProject = {
      ...p,
      scores: { ...p.scores, risk: risk.level },
    };
    const value = scoreValue(withRisk);
    const grade = risk.level === 'critical' ? 'D' : value.grade;

    return {
      ...p,
      scores: {
        authenticity: auth.total,
        value: value.total,
        risk: risk.level,
        grade,
        authenticityItems: auth.items,
        valueItems: value.items,
        riskItems: risk.items,
        evidenceChecklist: auth.checklist,
        authenticityVerifiedCount: auth.verifiedCount,
        authenticityPartialCount: auth.partialCount,
        authenticityTotalCount: auth.totalDimensions,
      },
      recommendation: buildRecommendation(grade, risk.level),
    };
  });
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function slugifyKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
}
