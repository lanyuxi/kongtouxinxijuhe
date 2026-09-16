/**
 * List 视图瘦身：把「列表页真正要用的字段」与「详情页才需要的重字段」分开。
 *
 * 为什么必须拆（这是首屏性能的根因，不是优化）：
 *   实测 data/airdrops.json 体积 3.87 MB / 189 个项目（≈20 KB/项目），
 *   首屏必须整包下载才能渲染第一张卡片。逐字段拆解后体积主要来自：
 *     · digest（实质内容指纹，约 1.26 MB）—— 纯内部维护字段，前端一个字节都不用
 *     · guide[].description / done_when（约 386 KB）—— 卡片只用到步骤标题
 *     · scores.*Items（约 374 KB）—— 卡片只用到数值与等级
 *     · sourcedSteps（约 95 KB）—— 中间产物，前端从不消费
 *     · faq / evidence / risks（约 166 KB）—— 只有详情页渲染
 *
 * 取舍：列表 JSON 保留「卡片 + 筛选 + 排序 + 相对分位」所需的全部字段
 *   （含 guide 的标题与 needs_signature，卡片「操作：…」与「新手友好」要用），
 *   其余一切下沉到 data/details/<slug>.json，由详情页按需拉取。
 *
 * 实测效果（189 个项目）：
 *   3.87 MB → 502 KB（原始体积 -87%）；gzip 后约 27 KB。
 *   保留 2 空格缩进而非压缩成一行：数据文件要进 git，
 *   可读 diff 的价值高于再省几十 KB（传输侧 gzip 已经解决）。
 *
 * 不变量：
 *   1. 瘦身只影响**下发形态**，不改变任何评分 / 结论，列表与详情的数值必须完全一致；
 *   2. details/ 仍然写「完整项目」，保证详情页字段一个都不缺；
 *   3. 列表里必须保留 digest 之外的判定字段 —— 但 digest 本身必须剔除，
 *      它是纯内部字段，且不需要逐帧参与任何前端逻辑。
 */

import type { AirdropProject, GuideStep, ListDataset, ScoreItem } from '../../src/lib/types';

/** 列表卡片所需的「轻量教程步骤」：只保留渲染与判定需要的字段 */
export interface ListGuideStep {
  step: number;
  title: string;
  minutes: number;
  needs_wallet: boolean;
  needs_signature: boolean;
  risk: GuideStep['risk'];
}

/** 列表卡片所需的「轻量评分明细」：数值与等级，不含逐项解释 */
export interface ListScores {
  authenticity: number;
  value: number;
  risk: AirdropProject['scores']['risk'];
  grade: AirdropProject['scores']['grade'];
}

/**
 * 列表形态的项目。
 *
 * 与 AirdropProject 的差异用类型显式表达，避免前端误用「列表里其实没有的字段」：
 * 详情页字段（faq / evidence / guide.description / scores.*Items / sourcedSteps / digest）
 * 类型上就不存在，必须走 loadProjectDetail 拿到完整数据后再用。
 */
export interface ListProject {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  category: AirdropProject['category'];
  chains: AirdropProject['chains'];
  status: AirdropProject['status'];
  official: AirdropProject['official'];
  logo?: string;
  meta?: AirdropProject['meta'];
  tasks: string[];
  requirements: string[];
  sources: AirdropProject['sources'];
  scores: ListScores;
  cost: AirdropProject['cost'];
  recommendation: AirdropProject['recommendation'];
  guide: ListGuideStep[];
  guide_source: AirdropProject['guide_source'];
  created_at: string;
  /**
   * 首次被本系统收录的时间（P2-1）。
   *
   * ⚠️ 必须保留：列表磁贴「今日新收录」的口径依据就是这个字段。
   *    它只占一个 ISO 时间串（约 24 字节/项目），
   *    剔除它会让口径静默退回「本轮进入数据集」的旧语义 ——
   *    那正是 P2-1 要修的误导。
   *
   *    这也是「瘦身白名单必须逐字段审」的实例：
   *    main 侧的瘦身按「详情页才要」的标准裁字段，
   *    但 first_seen_at 是**列表口径**依据，漏掉它会改行为而不是省体积。
   */
  first_seen_at?: string;
  discovered_at: string;
  last_checked_at: string;
  last_changed_at: string;
}

/**
 * 完整项目 → 列表项目。
 *
 * 注意：这里**不做任何计算**，只做字段裁剪。
 * 一旦在这里顺手「补一个默认值」，列表与详情的数值就可能漂移，
 * 用户点进详情会看到对不上的分数。
 */
export function toListProject(p: AirdropProject): ListProject {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    tagline: p.tagline,
    category: p.category,
    chains: p.chains,
    status: p.status,
    official: p.official,
    meta: p.meta,
    tasks: p.tasks,
    requirements: p.requirements,
    sources: p.sources,
    scores: {
      authenticity: p.scores.authenticity,
      value: p.scores.value,
      risk: p.scores.risk,
      grade: p.scores.grade,
    },
    cost: p.cost,
    recommendation: p.recommendation,
    guide: p.guide.map((g) => ({
      step: g.step,
      title: g.title,
      minutes: g.minutes,
      needs_wallet: g.needs_wallet,
      needs_signature: g.needs_signature,
      risk: g.risk,
    })),
    guide_source: p.guide_source,
    created_at: p.created_at,
    first_seen_at: p.first_seen_at,
    discovered_at: p.discovered_at,
    last_checked_at: p.last_checked_at,
    last_changed_at: p.last_changed_at,
  };
}

/** 构建列表数据集 */
export function buildListDataset(
  projects: AirdropProject[],
  meta: { updated_at: string; new_today: number },
): ListDataset {
  return {
    updated_at: meta.updated_at,
    new_today: meta.new_today,
    projects: projects.map(toListProject),
  };
}

/** 仅用于测试：断言裁剪后不再包含详情重字段 */
export const DETAIL_ONLY_FIELDS = [
  'digest',
  'sourcedSteps',
  'faq',
  'risks',
  'evidence',
  'profile_digest',
  'miss_streak',
] as const;

export type { ScoreItem };
