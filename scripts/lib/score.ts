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

export function scoreAuthenticity(p: AirdropProject, evidence: Evidence[]): {
  total: number;
  items: ScoreItem[];
} {
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

  const contract = has('contract');
  items.push({
    key: 'authenticity.contract',
    label: '合约地址在区块浏览器可验证',
    value: contract ? 5 : 0,
    max: 5,
    reason: contract ? '合约地址可验证' : '暂无公开可验证合约地址',
  });

  const total = items.reduce((s, i) => s + i.value, 0);
  return { total: clamp(total), items };
}

/** ---------- 风险评分 ---------- */

const RISK_RANK: Record<RiskLevel, number> = {
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

/**
 * 风险因素表（第 12 章）。
 *
 * ⚠️ 这张表的定级原则（本次修订的核心）：
 *   风险 = **亏损概率 × 亏损金额**，而不是「有没有用到某个 DeFi 功能」。
 *
 *   历史问题：`涉及 LP / Farming / 质押` 曾被直接判 HIGH，
 *   但这是 DeFi 空投的**标准动作** —— Aave / Pendle / EigenLayer 全都命中。
 *   实测 66 个「高风险」里有 60 个是它触发的，其中 5 个还是 S/A 级项目：
 *   用户在「值得关注」和「高风险」两个磁贴里看到重叠项目，认知直接冲突，
 *   真正危险的信号（未验证合约、向新合约转资产）被淹没在噪音里。
 *
 *   因此按「是否可能造成**不可逆**损失」重新定级：
 *     - low    ：不接触资产（社交任务、连接钱包）
 *     - medium ：可逆 / 常见的链上动作（签名、Swap、跨链、LP、质押、锁仓）
 *                这些动作本身是行业惯例，风险来自「授权范围」而非动作本身，
 *                真正的防线是「授权前核对额度 + 事后撤销」，属提示级而非警报级
 *     - high   ：可能造成**不可逆**损失或来源不明的可执行内容
 *                （无限授权、向未验证的新合约转入资产、下载来源不明的客户端）
 */
export const RISK_FACTORS: { kw: RegExp; label: string; risk: RiskLevel }[] = [
  { kw: /social\s?task|关注\s?x|join\s?discord|社交任务/i, label: '仅需社交任务', risk: 'low' },
  { kw: /connect\s?wallet|连接钱包/i, label: '需要连接钱包', risk: 'low' },
  { kw: /signature|签名/i, label: '需要钱包签名', risk: 'medium' },
  { kw: /approve|授权/i, label: '需要 Token Approval', risk: 'medium' },
  { kw: /bridge|跨链/i, label: '涉及跨链桥', risk: 'medium' },
  { kw: /swap|trading|交易/i, label: '涉及 Swap / 交易', risk: 'medium' },
  // DeFi 标准动作：是「需要留意授权」的提示，不是「高危」警报。
  // 判 HIGH 会让几乎每个借贷/DEX/质押项目都变红，信号彻底失效。
  { kw: /lp\b|farming|提供流动性|质押|stake|再质押/i, label: '涉及 LP / Farming / 质押', risk: 'medium' },
  { kw: /lock\s?token|锁仓/i, label: '涉及锁仓', risk: 'medium' },
  // 不可逆损失类：这些才保留 high
  { kw: /unlimited\s?approval|无限授权/i, label: '需要无限授权', risk: 'high' },
  { kw: /deposit|向合约转入|transfer\s?asset/i, label: '需要向新合约转入资产', risk: 'high' },
  { kw: /download\s?client|下载客户端|下载\s?app/i, label: '需要下载客户端', risk: 'high' },
];

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

  /**
   * 「合约未经验证」：**不再用于提升风险等级**，只作为数据覆盖说明。
   *
   * 为什么必须去掉这一档（第一性原理：风险信号必须有区分度）：
   *   实测 189 个项目里，**有合约证据的为 0 个** —— 数据源（聚合站 / DefiLlama）
   *   本来就不提供合约地址。于是「合约未经验证」对**每一个**项目都成立，
   *   它不是「这个项目危险」，而是「我们的数据覆盖不到合约层」。
   *   用它去判 HIGH，等于给全部 DeFi 项目统一刷红：
   *   历史实测命中 37~68 个，是高风险数量虚高的最大来源。
   *
   *   正确的表达是把「我们能确认什么 / 不能确认什么」如实告诉用户，
   *   把「核对合约地址」作为**操作建议**（在教程与防骗页已有），
   *   而不是伪造一个它并不具备的**风险等级**。
   */
  const hasContractEvidence = p.evidence.some((e) => e.type === 'contract' && e.verified);
  const interactsContract = /approve|授权|swap|交易|bridge|跨链|lp\b|质押|stake|deposit|存入|转入/i.test(
    haystack,
  );
  if (interactsContract && !hasContractEvidence) {
    items.push({
      key: 'risk.contract_coverage',
      label: '合约地址未覆盖（数据源不提供）',
      value: 0,
      max: 3,
      reason:
        '本平台的数据源不提供合约地址，因此无法替你验证合约。' +
        '参与前请自行到区块浏览器核对合约地址是否来自官方公告。',
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

/**
 * 从 tagline 里解析 DefiLlama 提供的 TVL（单位：百万美元）。
 *
 * 为什么用它：TVL 是本数据集里**唯一带真实数量级、且有宽分布**的客观字段
 *   （实测 121/189 项目有值，从 $5M 到 $24B，跨 3 个数量级）。
 *   旧的价值模型完全不看它，导致「一家锁仓 240 亿的协议」与
 *   「一个刚上线的协议」拿到同样的分数 —— 这正是 92% 项目挤在 C 的原因。
 */
export function parseTvlMillions(tagline?: string): number | null {
  if (!tagline) return null;
  const m = /TVL\s*约\s*\$([0-9]+(?:\.[0-9]+)?)\s*M/i.exec(tagline);
  return m ? Number(m[1]) : null;
}

/** TVL → 规模分（0–20，对数分档，避免巨头把分布拉爆） */
function scaleScore(tvlM: number | null): { value: number; reason: string } {
  if (tvlM === null) {
    return { value: 0, reason: '未获取到资金规模数据（数据源未提供）' };
  }
  // 对数分档：$5M→6 分，$50M→10，$500M→14，$5B+→20
  const value =
    tvlM >= 5000 ? 20 : tvlM >= 2000 ? 18 : tvlM >= 500 ? 14 : tvlM >= 100 ? 11 : tvlM >= 20 ? 8 : 6;
  const label =
    tvlM >= 1000 ? `$${(tvlM / 1000).toFixed(1)}B` : `$${Math.round(tvlM)}M`;
  return {
    value,
    reason: `链上锁仓规模约 ${label}，规模越大通常意味着产品被真实使用、抗风险能力更强`,
  };
}

export function scoreValue(p: AirdropProject): {
  total: number;
  grade: ValueGrade;
  items: ScoreItem[];
} {
  const items: ScoreItem[] = [];

  /**
   * 修正说明（P1-3）：旧模型 92% 的项目得分同为 49 分。
   *   原因是七项里有五项对「普通项目」是固定常数：
   *   基本面 7、活动 4、信号 9、投入产出比 15、时机 10、稀释 4 —— 合计正好 49。
   *   真正能区分的两项（融资、活跃度）又几乎都拿 0 分（数据缺失）。
   *   结果「参与价值」这个卖点退化成一句「大家都是 C」。
   *
   *   新模型改为**只用有真实分布的数据打分**：
   *   规模（TVL，121 个项目有值、跨 3 个数量级）、
   *   验证充分度（证据条数与已验证比例）、来源广度（独立来源数）、
   *   信号强度、以及按状态分档的时机。缺失数据明确给 0 并在理由里说清，
   *   不再用「人人都满分」的常数把分数抬到同一个值。
   */

  // 1) 资金规模 20：唯一具备真实数量级的客观字段（见 scaleScore）
  const tvl = parseTvlMillions(p.tagline);
  const scale = scaleScore(tvl);
  items.push({
    key: 'value.scale',
    label: '链上规模 / 产品成熟度',
    value: scale.value,
    max: 20,
    reason: scale.reason,
  });

  // 2) 验证充分度 20：证据越多、已验证比例越高，越值得投入研究
  const totalEvidence = p.evidence.length;
  const verifiedEvidence = p.evidence.filter((e) => e.verified).length;
  const verifyRatio = totalEvidence ? verifiedEvidence / totalEvidence : 0;
  const verification = Math.min(
    20,
    Math.round(verifiedEvidence * 3 + verifyRatio * 8),
  );
  items.push({
    key: 'value.verification',
    label: '信息验证充分度',
    value: verification,
    max: 20,
    reason:
      totalEvidence === 0
        ? '未收集到可验证的证据'
        : `共 ${totalEvidence} 条证据，其中 ${verifiedEvidence} 条已验证（验证率 ${Math.round(
            verifyRatio * 100,
          )}%）`,
  });

  // 3) 来源广度 10：独立来源越多，信息越难被单一来源误导
  const sourceNames = new Set(p.sources.map((s) => s.name));
  const thirdPartyCount = p.evidence.filter((e) => e.type === 'third_party').length;
  const breadth = Math.min(10, (sourceNames.size >= 3 ? 10 : sourceNames.size === 2 ? 7 : 4) + (thirdPartyCount >= 2 ? 0 : 0));
  items.push({
    key: 'value.breadth',
    label: '来源广度',
    value: breadth,
    max: 10,
    reason: `来自 ${sourceNames.size} 个独立数据源${sourceNames.size >= 3 ? '，交叉验证较充分' : '，建议再找官方渠道确认'}`,
  });

  // 4) 融资 / 投资机构 10
  const fundingScore = p.meta?.funding ? (p.meta?.investors?.length ? 10 : 6) : 0;
  items.push({
    key: 'value.funding',
    label: '融资 / 投资机构',
    value: fundingScore,
    max: 10,
    reason: p.meta?.funding ? `融资信息：${p.meta.funding}` : '未核实融资信息，机构背书不足',
  });

  // 5) Token / Airdrop 信号强度 20
  const signal = p.status === 'claim_live' ? 20 : p.status === 'confirmed' ? 16 : p.status === 'potential' ? 9 : 4;
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

  // 6) 任务投入产出比 15：按步骤数与耗时**连续**打分，不再是人人都满分的常数
  const tasksCount = p.guide.length || p.tasks.length;
  const effort = p.cost.time_minutes;
  let roi: number;
  if (tasksCount === 0 || effort === 0) {
    roi = 5;
  } else if (effort <= 20) {
    roi = 15;
  } else if (effort <= 40) {
    roi = 12;
  } else if (effort <= 90) {
    roi = 8;
  } else if (effort <= 240) {
    roi = 4;
  } else {
    roi = 2;
  }
  // 步骤过多会稀释精力，进一步下调（真实差异来自步骤数，不是固定档位）
  if (tasksCount > 7) roi = Math.max(2, roi - 3);
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

  // 7) 当前参与时机 5：早期阶段拿满分，后期递减（原为固定 10，无区分度）
  const timing = p.status === 'new' ? 5 : p.status === 'potential' ? 4 : p.status === 'confirmed' ? 3 : 1;
  items.push({
    key: 'value.timing',
    label: '当前参与时机',
    value: timing,
    max: 5,
    reason:
      p.status === 'new' || p.status === 'potential'
        ? '仍处于早期阶段，参与时机较好'
        : '已进入后期阶段，参与窗口收窄',
  });

  const total = clamp(items.reduce((s, i) => s + i.value, 0));
  return { total, grade: gradeOf(total), items };
}

/**
 * 参与价值等级。
 *
 * ⚠️ 阈值必须与实际分布对齐，否则「等级」这个卖点会失效：
 *   旧阈值（85/70/55/40）是按「模型平均给分虚高」调的，
 *   修好模型后真实分布是 35–67（中位 51），结果 79% 项目仍是 C、
 *   S/A 一个都出不来 —— 等于把「价值分级」从「全 C」搬到了「全 C」。
 *
 *   因此按当前真实分布重新校准（189 个项目的实测分位）：
 *     S ≥ 60（前 ~7%）   A ≥ 56（前 ~20%）
 *     B ≥ 52（前 ~45%）  C ≥ 42（前 ~85%）  D < 42
 *   阈值集中在此，便于数据分布变化时统一调整；单测会锁定等级单调性。
 */
export const GRADE_THRESHOLDS = { S: 60, A: 56, B: 52, C: 42 } as const;

export function gradeOf(v: number): ValueGrade {
  if (v >= GRADE_THRESHOLDS.S) return 'S';
  if (v >= GRADE_THRESHOLDS.A) return 'A';
  if (v >= GRADE_THRESHOLDS.B) return 'B';
  if (v >= GRADE_THRESHOLDS.C) return 'C';
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
    // D 级的文案是「当前不值得投入时间与资金」，动作必须与之一致（avoid），
    // 否则会出现「结论说不值得投入、标签却是观察」的自相矛盾。
    action: grade === 'S' || grade === 'A' ? 'participate' : grade === 'D' ? 'avoid' : 'observe',
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
