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

  const total = clamp(items.reduce((s, i) => s + i.value, 0));
  return { total, grade: gradeOf(total), items };
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
