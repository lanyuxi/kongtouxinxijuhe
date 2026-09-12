/**
 * DropLens 核心数据类型定义。
 *
 * 设计原则（对应方案文档第 27 章「系统核心不变量」）：
 * - 无证据的项目不能标记为已确认（verified）
 * - 每个评分必须可解释（breakdown）
 * - 数据结构必须能承载来源追溯（source_url）
 */

/** 项目生命周期状态 */
export type AirdropStatus =
  | 'new' // 新发现
  | 'potential' // 潜在空投
  | 'confirmed' // 已确认
  | 'claim_live' // 开放领取
  | 'ended'; // 已结束

/** 风险等级（与真实性、价值分离，不合成总分） */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** 参与价值等级 */
export type ValueGrade = 'S' | 'A' | 'B' | 'C' | 'D';

/** 项目分类 */
export type Category =
  | 'DeFi'
  | 'L2'
  | 'AI'
  | 'DePIN'
  | 'GameFi'
  | 'Social'
  | 'Infra'
  | 'NFT'
  | 'Other';

/** 支持筛选的公链 */
export type Chain =
  | 'Ethereum'
  | 'Solana'
  | 'Base'
  | 'Arbitrum'
  | 'Optimism'
  | 'BNB Chain'
  | 'Sui'
  | 'Other';

/**
 * 评分项：必须同时携带分数与理由。
 * 不允许只显示一个孤立的数字。
 */
export interface ScoreItem {
  /** 键，例如 authenticity.website */
  key: string;
  /** 展示名称（简体中文） */
  label: string;
  /** 该项得分 */
  value: number;
  /** 该项满分 */
  max: number;
  /** 人类可读解释 */
  reason: string;
  /** 证据链接（可选） */
  evidenceUrl?: string;
}

export interface ScoreBreakdown {
  /** 0–100，真实性置信度 */
  authenticity: number;
  /** 0–100，参与价值 */
  value: number;
  /** 风险等级 */
  risk: RiskLevel;
  /** 参与价值等级 */
  grade: ValueGrade;
  /** 真实性评分明细 */
  authenticityItems: ScoreItem[];
  /** 参与价值评分明细 */
  valueItems: ScoreItem[];
  /** 风险评分明细 */
  riskItems: ScoreItem[];
}

/** 来源记录：任何进入系统的数据都必须带来源 */
export interface SourceRef {
  type:
    | 'airdrop_aggregator'
    | 'rewards_tracker'
    | 'quest_platform'
    | 'official'
    | 'third_party';
  /** 来源展示名，例如 Airdrops.io */
  name: string;
  url: string;
  /** 抓取时间 ISO8601 */
  fetched_at: string;
}

/** 证据：用于计算真实性置信度 */
export interface Evidence {
  type:
    | 'official_website'
    | 'official_announcement'
    | 'official_x'
    | 'official_docs'
    | 'official_github'
    | 'quest_space'
    | 'third_party'
    | 'funding'
    | 'contract';
  label: string;
  url: string;
  /**
   * 是否已通过交叉验证。
   * 注意：第三方页面提供的链接默认 false，必须交叉验证后才可置为 true。
   */
  verified: boolean;
  /** 验证说明 */
  note?: string;
}

/** 成本模型 */
export interface CostModel {
  capital_min_usd: number;
  capital_max_usd: number;
  gas_estimate_usd: number;
  time_minutes: number;
  long_term: boolean;
  /** 一句话成本结论（简体中文） */
  summary: string;
}

/** 教程步骤 */
export interface GuideStep {
  step: number;
  title: string;
  /** 操作目标 */
  description: string;
  official_url: string;
  /** 预计耗时（分钟） */
  minutes: number;
  /** 是否花钱 */
  cost_usd: number;
  /** 是否需要连接钱包 */
  needs_wallet: boolean;
  /** 是否需要签名 */
  needs_signature: boolean;
  risk: RiskLevel;
  /** 完成标准 */
  done_when: string;
  /** 来源链接，用于追溯 */
  source_url?: string;
  /** 来源是否充分，false 时前端显示「尚未通过完整来源验证」 */
  source_verified: boolean;
}

export interface FaqItem {
  q: string;
  a: string;
}

/** 推荐结论 */
export interface Recommendation {
  grade: ValueGrade;
  /** 一句话可执行结论 */
  summary: string;
  /** 是否建议参与 */
  action: 'participate' | 'observe' | 'avoid';
}

export interface AirdropProject {
  id: string;
  name: string;
  slug: string;
  /** 一句话介绍 */
  tagline: string;
  category: Category;
  chains: Chain[];
  status: AirdropStatus;

  official: {
    website?: string;
    x?: string;
    docs?: string;
    github?: string;
    discord?: string;
    galxe?: string;
  };

  /** 项目基础面信息 */
  meta?: {
    funding?: string;
    investors?: string[];
    token_status?: string;
    airdrop_status?: string;
  };

  /** 主要任务摘要，例如「测试网 · 社交任务 · 邀请」 */
  tasks: string[];
  /** 参与要求 */
  requirements: string[];

  sources: SourceRef[];
  evidence: Evidence[];

  scores: ScoreBreakdown;
  cost: CostModel;
  recommendation: Recommendation;
  guide: GuideStep[];
  faq: FaqItem[];
  risks: string[];

  /** 发现时间 */
  created_at: string;
  /** 数据新鲜度三件套 */
  discovered_at: string;
  /** 最近一次「被数据源检查」的时间，每轮抓取都会更新 */
  last_checked_at: string;
  /**
   * 最近一次「实质内容发生变化」的时间。
   * 注意：只有 name / status / 评分 / 成本 / 教程 / 证据 等实质字段变化时才会更新，
   * 仅仅重新抓取一次不会改动它，否则前端「数据变化时间」会永远显示「刚刚」。
   */
  last_changed_at: string;

  /**
   * 实质内容指纹（由 scripts/lib/change.ts 计算）。
   * 用于判断「本轮抓取是否真的带来了新信息」：
   * 指纹不含 last_checked_at / fetched_at 等运行时刻字段。
   */
  digest?: string;

  /**
   * 数据源侧抓到的原始步骤（例如聚合站页面上的 HowTo）。
   * 仅作为 Guide 生成阶段的输入，属于中间产物，
   * 不会直接下发到前端（前端只消费 guide[]）。
   */
  sourcedSteps?: { title: string; body?: string; url?: string }[];

  /**
   * 人工档案（data/seed/official-profiles.json）内容的指纹。
   * 用于判断档案是否真的被改动过：只有指纹变化才更新 last_changed_at，
   * 避免静态档案每轮都被误判为「数据发生变化」。
   */
  profile_digest?: string;

  /**
   * 连续多少轮未被任何数据源提及。
   * 用于清理「历史误抓的运营页」，属于内部维护字段：
   * Prune 阶段会清零或累加，前端不展示。
   */
  miss_streak?: number;
}

/** 单个数据源的健康状态 */
export interface SourceHealth {
  name: string;
  url: string;
  ok: boolean;
  /** 本次抓取条目数 */
  fetched: number;
  /** 失败原因 */
  error?: string;
  /** 最近一次成功时间 */
  last_success_at?: string;
  checked_at: string;
}

export interface SourceHealthFile {
  updated_at: string;
  sources: SourceHealth[];
}

export interface Dataset {
  updated_at: string;
  /** 今日新增数量 */
  new_today: number;
  projects: AirdropProject[];
}

/** 各来源实时抓取快照的索引（供「一键更新」判断数据新鲜度） */
export interface LiveIndex {
  updated_at: string;
  total: number;
  sources: {
    source: string;
    source_url: string;
    fetched_at: string;
    count: number;
    file: string;
  }[];
}

/** 最近一次抓取任务的运行状态（供「一键更新」轮询进度） */
export interface RefreshStatus {
  state: 'idle' | 'running' | 'success' | 'failed';
  started_at?: string;
  finished_at?: string;
  /** 本次抓取涉及的来源数 */
  sources?: number;
  /** 成功来源数 */
  ok_sources?: number;
  error?: string;
  updated_at?: string;
  /**
   * 本轮抓取是否带来了「实质内容」变化。
   * 判定时会剔除 last_checked_at / fetched_at 等运行时刻字段，
   * 因此「跑了一轮但数据没变」会如实返回 false。
   */
  data_changed?: boolean;
  /** 人类可读的差异摘要，例如「新增 3、变更 12」 */
  change_summary?: string;
  added?: number;
  modified?: number;
  removed?: number;
}
