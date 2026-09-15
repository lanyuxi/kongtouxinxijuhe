/**
 * 空投情报平台核心数据类型定义。
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

/**
 * 支持筛选的公链。
 *
 * ⚠️ 这份清单是「已知公链的规范化目标」，**不是白名单**。
 *   历史问题：清单只有 9 项且 `normalizeChain` 用它做白名单拦截，
 *   任何不在这 9 项里的链都被硬塞成 `Other`，
 *   实测 189 个项目里 124 个（65.6%）公链显示「其他公链」——
 *   公链筛选器点了「其他公链」出来 124 条，等于没有筛选价值。
 *   因此这里补齐主流链，且未识别的链走 `Other` 但**保留原始名**（见 Chain 展示逻辑），
 *   不再把「未收录」等同于「其他」。
 */
export type KnownChain =
  | 'Ethereum'
  | 'Solana'
  | 'Base'
  | 'Arbitrum'
  | 'Optimism'
  | 'BNB Chain'
  | 'Polygon'
  | 'Avalanche'
  | 'Sui'
  | 'Aptos'
  | 'TON'
  | 'Tron'
  | 'Bitcoin'
  | 'Linea'
  | 'Scroll'
  | 'Blast'
  | 'zkSync'
  | 'Mantle'
  | 'Hyperliquid'
  | 'Cosmos'
  | 'Polkadot'
  | 'Near'
  | 'Starknet'
  | 'Sei'
  | 'Berachain'
  | 'Sonic'
  | 'World Chain'
  | 'Unichain'
  | 'Ink'
  | 'Other';

/**
 * 项目公链。
 *
 * 为什么不用 `KnownChain` 直接约束：
 *   公链是**开放集合**，每周都有新链上线。若用联合类型硬约束，
 *   类型上就逼着实现把未收录的链折叠成 'Other'（历史 65% 项目遭殃）。
 *   因此这里放宽为「已知链 + 任意字符串」：
 *   已知链提供筛选选项与中文标签，未知链原样保留、照常展示与搜索。
 */
export type Chain = KnownChain | (string & {});

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

  /**
   * 项目官方 logo 的站内地址，例如 "./logos/aave-v3.png"。
   *
   * 由 scripts/logo/fetch-logos.mjs 抓取、public/logos/ 随仓库发布，
   * 前端在 loadDataset 时从 data/logo-map.json 贴到项目上。
   * 为什么不用外链：外链图标一旦对方限流或被墙，列表页会整排变破图；
   * 站内文件保证离线、稳定、可缓存，也不产生任何第三方请求。
   */
  logo?: string;

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
  /**
   * 教程步骤的来源类型，用于前端如实标注，避免把「示意模板」当成真实教程。
   *
   * - `sourced`：步骤来自数据源侧抓到的真实 HowTo（可追溯到原始页面），
   *   此时 guide[].source_url 指向该原始页面。
   * - `template`：数据源未提供 HowTo，步骤由确定性模板生成，
   *   只能作为「大致流程示意」，不代表官方要求的实际步骤。
   *
   * 为什么必须显式区分：
   *   模板教程看起来与真实教程完全一样（同样有步骤号、耗时、完成标准），
   *   用户无法自行分辨。若不标注，就会把通用流程误当成官方要求，
   *   既误导用户，也违背「教程必须可追溯」这条不变量。
   */
  guide_source: 'sourced' | 'template';
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

/**
 * 列表项目：只含卡片 / 筛选 / 排序所需字段。
 *
 * 为什么单独定义而不是复用 AirdropProject：
 *   1. 类型上就断掉对详情字段的引用，避免列表页误读「其实没有下发」的字段；
 *   2. data/airdrops.json 只下发这一形态，体积从 3.87 MB 降到 ~300 KB 量级，
 *      详情字段（faq / evidence / guide.description / scores 明细 / digest）
 *      按需从 data/details/<slug>.json 拉取。
 * 字段含义与 AirdropProject 完全一致，仅做裁剪，不做任何换算。
 */
export interface ListGuideStep {
  step: number;
  title: string;
  minutes: number;
  needs_wallet: boolean;
  needs_signature: boolean;
  risk: RiskLevel;
}

export interface ListProject {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  category: Category;
  chains: Chain[];
  status: AirdropStatus;
  official: AirdropProject['official'];
  logo?: string;
  meta?: AirdropProject['meta'];
  tasks: string[];
  requirements: string[];
  sources: SourceRef[];
  scores: {
    authenticity: number;
    value: number;
    risk: RiskLevel;
    grade: ValueGrade;
  };
  cost: CostModel;
  recommendation: Recommendation;
  guide: ListGuideStep[];
  guide_source: 'sourced' | 'template';
  created_at: string;
  discovered_at: string;
  last_checked_at: string;
  last_changed_at: string;
}

/**
 * 完整数据集：**内部 / 构建期**使用的形态，projects 是完整项目。
 * 注意：它**不再**是前端下发的 airdrops.json 形态（那是 ListDataset）。
 * 二者刻意分开，否则「列表瘦身」会被类型系统悄悄绕过。
 */
export interface Dataset {
  updated_at: string;
  /** 今日新增数量 */
  new_today: number;
  projects: AirdropProject[];
}

/** 下发给前端的列表数据集：projects 只含卡片字段（体积从 3.87 MB → ~300 KB） */
export interface ListDataset {
  updated_at: string;
  new_today: number;
  projects: ListProject[];
}

/**
 * 项目 logo 映射文件（data/logo-map.json）。
 * logos：slug → 站内相对路径（相对站点根），例如 "logos/aave-v3.png"。
 * sources：slug → 该图标实际下载自哪个地址，便于人工复核图标归属。
 */
export interface LogoMap {
  updated_at: string;
  total: number;
  logos: Record<string, string>;
  sources?: Record<string, string>;
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
  /** 人类可读的差异摘要，例如「变更 2 个：Monad 状态：潜在空投 → 开放领取」 */
  change_summary?: string;
  /**
   * 项目级变更明细，例如 ['Monad 状态：潜在空投 → 开放领取']。
   *
   * 为什么单独存一份：只给「变更 12」这种计数，回访用户无法判断
   * 到底哪个项目变了、变成了什么。详细列表由前端直接展示。
   * 最多保留若干条，避免 refresh-status.json（前端每 5 秒轮询读取）体积失控。
   */
  change_details?: string[];
  added?: number;
  modified?: number;
  removed?: number;
}
