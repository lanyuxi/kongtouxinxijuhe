import type { AirdropProject } from '../lib/types';
import { CHAIN_LABEL, RISK_LABEL, STATUS_LABEL, relativeTime } from '../lib/labels';
import { operationSummary } from '../lib/tasks';
import { beginnerVerdict } from '../lib/beginner';
import { chineseBlurb } from '../lib/describe';
import { percentilePhrase } from '../lib/percentile';
import type { Percentiles } from '../lib/percentile';
import { ProjectLogo } from './ProjectLogo';

/**
 * 项目卡片（紧凑竖排版）。
 *
 * 用户要求列表从「一行 2 个」改为「一行 4 个」：
 *   1440 视口下每列只有约 325px，1920 下也只有 365px（外壳有 1600px 上限）。
 *   旧版卡片是按 590–750px 宽设计的（56px 图标、右上角两个按钮、
 *   独立的操作行、单行底栏），直接塞进 325px 必然溢出或截断。
 *   因此改为「竖排紧凑卡片」：
 *
 *   ┌──────────────────────────────┐
 *   │ ┌────┐  Aave V3          ☆ ↗ │  ← 40px 图标 + 名称（最多两行）+ 右上角按钮
 *   │ │logo│  潜在空投             │  ← 状态彩色文字，无底色
 *   │ └────┘                       │
 *   │ 操作：存入资产、借出资产       │  ← 单行省略，title 保留完整文案
 *   │ ──────────────────────────── │
 *   │ 以太坊 Ethereum 风险：低 价值：C │  ← 底栏第一行：吃满宽度，不省略
 *   │ 3 分钟前验证               › │  ← 底栏第二行：时间 + 进入提示
 *   └──────────────────────────────┘
 *
 * 为什么底栏拆两行：
 *   卡片内宽只有约 291px，而「公链 + 风险 + 价值 + 时间」实测需要约 360px。
 *   实测踩过的坑：挤在一行时 flex 会把公链压到 53px（`以太坊 Ethereum`
 *   实际需要 115px），公链只剩「以太...」，而时间却仍占满 92px —— 信息全丢。
 *   因此把信息密度最高的三项放第一行吃满宽度，时间单独放第二行。
 *
 * 沿用的既有约束：
 *   1. 图标一律是项目真实官方 Logo，不做字母兜底（缺图就露出空位，便于发现）；
 *   2. 卡片整体是原生 <a>，支持中键 / 新标签页 / Tab 聚焦；
 *   3. 收藏与「前往官网」是主链接之外的独立控件，点击不触发卡片跳转
 *      （<a> 里嵌 <button> 是非法 HTML，浏览器会把按钮拆出去导致布局错乱）；
 *   4. 卡片用 flex + h-full 拉齐高度，同排不会一高一矮。
 */

/** 状态 → 文字色（设计稿里状态是彩色文字，不是色块） */
const STATUS_TONE: Record<AirdropProject['status'], string> = {
  new: 'text-brand',
  potential: 'text-warn',
  confirmed: 'text-ok',
  claim_live: 'text-warn',
  ended: 'text-ink-faint',
};

/** 风险 → 文字色 */
const RISK_TONE: Record<AirdropProject['scores']['risk'], string> = {
  low: 'text-ok',
  medium: 'text-warn',
  high: 'text-danger',
  critical: 'text-danger',
};

export function ProjectCard({
  project,
  favorited,
  onToggleFavorite,
  variants = [],
  variantOf,
  percentiles,
}: {
  project: AirdropProject;
  favorited: boolean;
  /**
   * 相对分位（相对本批全部项目）。
   *
   * 为什么卡片上也要给：实测 174/188 个项目的价值等级都是 C，
   * 一屏「C」无法比较。卡片上的分位让用户扫一眼就知道该优先点开哪个，
   * 而不必逐个进详情页看绝对分。
   */
  percentiles?: Percentiles;
  /** 同一协议下的其他产品线（仅主条目传入），折叠展示，避免用户以为是多个空投 */
  variants?: AirdropProject[];
  /** 本条目归属的主条目（产品线时由父级传入） */
  variantOf?: string;
  onToggleFavorite: (slug: string) => void;
}) {
  const p = project;
  /** 一句话中文简介：回答小白「这项目是干什么的」 */
  const blurb = chineseBlurb(p);
  const chain = p.chains[0] ? CHAIN_LABEL[p.chains[0]] : '';
  const href = `#/project/${p.slug}`;
  const actions = operationSummary(p).join('、');
  const actionText = actions ? `操作：${actions}` : '操作：查看项目详情';
  const beginner = beginnerVerdict(p);
  const valuePct = percentiles?.value.get(p.slug);

  return (
    <article className="group relative flex h-full flex-col rounded-card border border-line bg-card p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card">
      {/* 右上角控件：必须位于主链接之外，否则点击会连带触发卡片跳转
          （<a> 里嵌 <button> 属于非法 HTML，浏览器会把它拆出来，布局会错乱） */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onToggleFavorite(p.slug)}
          aria-pressed={favorited}
          aria-label={favorited ? '取消收藏' : '收藏项目'}
          title={favorited ? '取消收藏' : '收藏项目'}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs transition duration-200 ${
            favorited
              ? 'border-brand/40 bg-brand-50 text-brand-600'
              : 'border-line bg-white text-ink-faint hover:border-brand/40 hover:text-brand-600'
          }`}
        >
          {favorited ? '★' : '☆'}
        </button>
        {p.official.website && (
          <a
            href={p.official.website}
            target="_blank"
            rel="noopener noreferrer"
            title="前往官方页面"
            aria-label={`前往 ${p.name} 官方页面`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-white text-xs text-ink-faint no-underline transition duration-200 hover:border-brand/40 hover:text-brand-600"
          >
            ↗
          </a>
        )}
      </div>

      {/* 整卡可点：<a> 包住全部正文 */}
      <a
        href={href}
        aria-label={`查看 ${p.name} 详情`}
        className="flex min-w-0 flex-1 flex-col text-inherit no-underline"
      >
        {/* 头部右侧留出两个圆形按钮的位置（2×28 + 间距 + 内边距 ≈ 76px） */}
        <div className="flex min-w-0 items-center gap-3 pr-[4.75rem]">
          <ProjectLogo project={p} size="sm" />
          <div className="min-w-0 flex-1">
            {/* 名称最多两行：4 列下长名称（如 Figure Markets Democratized Prime）
                必须允许折行，否则只能截成一行，可读性反而更差 */}
            <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-brand-600">
              {p.name}
            </h3>
          </div>
        </div>

        {/* 状态 + 新手友好角标：彩色文字，紧跟名称下方（不占右侧按钮区域，可吃满整行） */}
        <p className="mt-2 flex items-center gap-2 truncate text-xs font-medium">
          <span className={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</span>
          {beginner.friendly && (
            <span
              title={beginner.reason}
              className="shrink-0 rounded-full border border-ok/30 bg-ok-wash px-2 py-0.5 text-[11px] font-medium text-ok"
            >
              🌱 新手友好
            </span>
          )}
        </p>

        {/* 一句话中文简介：先回答「这是干什么的」，再回答「要做什么」。
            实测 188 个项目的 tagline 有 125 个是英文模板句（`Lending 协议，TVL 约 …`），
            对新手几乎无意义，因此这里展示确定性映射生成的中文说明。 */}
        <p
          title={blurb}
          className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-soft"
        >
          {blurb}
        </p>

        {/* 操作：单行省略，完整文案放在 title 里，悬停可看全 */}
        <p title={actionText} className="mt-1 truncate text-xs leading-relaxed text-ink-faint">
          {actionText}
        </p>

        {/* 同协议产品线：折叠成一行文字，避免「Aave V3 / V4 / Horizon」被当成 3 个空投 */}
        {variants.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-ink-faint" title={variants.map((v) => v.name).join('、')}>
            同协议还有 {variants.length} 条产品线：
            {variants.map((v) => v.name).join('、')}
          </p>
        )}
        {variantOf && (
          <p className="mt-1 truncate text-[11px] text-ink-faint">
            属于同一协议 <a href={`#/project/${variantOf}`} className="text-brand no-underline hover:underline">{variantOf}</a>
          </p>
        )}

        {/* 底栏：分隔线 + 元信息。
            4 列下列宽只有 ~290px（卡片内宽），而「公链 + 风险 + 价值 + 时间」
            四项实测需要 ~360px。实测踩过的坑：若把四项挤在一行，
            flex 会把公链压成 53px（内容需 115px），于是「以太坊 Ethereum」
            只剩「以太...」，而右侧时间仍占满 92px —— 信息全丢。
            因此这里分成两行，且把最不关键的「相对验证时间」移到第二行，
            让公链 / 风险 / 价值吃满整行宽度，四项信息一个都不省略。 */}
        <div className="mt-auto border-t border-line-soft pt-2.5 text-xs">
          <div className="flex items-center gap-2.5 text-ink-soft">
            {chain && <span className="truncate">{chain}</span>}
            <span className="shrink-0 whitespace-nowrap">
              风险：
              <span className={`font-medium ${RISK_TONE[p.scores.risk]}`}>
                {RISK_LABEL[p.scores.risk]}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap">
              价值：<span className="font-medium text-ink">{p.scores.grade}</span>
            </span>
            {/* 相对分位：让「价值 C」有一个参照系，而不是孤零零一个字母 */}
            {valuePct !== undefined && (
              <span
                className="shrink-0 whitespace-nowrap text-ink-faint"
                title={`参与价值在本批 ${percentiles?.total ?? 0} 个项目中的相对位置：${percentilePhrase(valuePct)}`}
              >
                · {percentilePhrase(valuePct)}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-ink-faint">
            <span className="truncate">{relativeTime(p.last_checked_at)}验证</span>
            <span aria-hidden className="shrink-0 text-line transition-colors group-hover:text-brand-600">
              ›
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
