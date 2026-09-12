import type { AirdropProject } from '../lib/types';
import { CHAIN_LABEL, RISK_LABEL, STATUS_LABEL, relativeTime } from '../lib/labels';
import { operationSummary } from '../lib/tasks';
import { ProjectLogo } from './ProjectLogo';

/**
 * 项目卡片。
 *
 * 视觉规范来自用户提供的设计稿（Group 4）：
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  ┌──────┐  Aave Horizon RWA                    ☆   ↗    │
 *   │  │ logo │  🖿 操作：存入资产、借出资产、保持健康度          │
 *   │  └──────┘                                                │
 *   │  ────────────────────────────────────────────────────    │
 *   │  潜在空投   以太坊 Ethereum   风险：低   价值：C   4 分钟前验证 › │
 *   └──────────────────────────────────────────────────────────┘
 *
 * 与设计稿一致的关键约束：
 *   1. 图标是**大号圆角方块**（56px），项目名的水平中线与图标中线对齐；
 *   2. 收藏 / 前往官网是**右上角两个圆形轻按钮**，不带文字；
 *   3. 「操作：…」只有一行，前缀是一个小图标，不是文字标签；
 *   4. 底栏是**一条分隔线上的单行元信息**，左到右依次为
 *      状态（彩色文字，无底色）→ 公链 → 风险 → 价值 → 相对验证时间 + ›；
 *   5. 整卡可点进入详情（原生 <a>），卡片本身是白底细边框、
 *      圆角约 12px、几乎无阴影，只有 hover 才轻微抬起。
 */

/** 状态 → 底栏文字色（设计稿里状态是彩色文字，不是色块） */
const STATUS_TONE: Record<AirdropProject['status'], string> = {
  new: 'text-brand',
  potential: 'text-warn',
  confirmed: 'text-ok',
  claim_live: 'text-warn',
  ended: 'text-ink-faint',
};

/** 风险 → 底栏文字色 */
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
}: {
  project: AirdropProject;
  favorited: boolean;
  onToggleFavorite: (slug: string) => void;
}) {
  const p = project;
  const chain = p.chains[0] ? CHAIN_LABEL[p.chains[0]] : '';
  const href = `#/project/${p.slug}`;
  // 设计稿里「操作：」后面是一行逗号分隔的动作短语
  const actions = operationSummary(p).join('、');

  return (
    <article className="group relative rounded-card border border-line bg-card transition duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card">
      {/* 右上角圆形轻按钮：收藏 + 前往官网 */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleFavorite(p.slug)}
          aria-pressed={favorited}
          aria-label={favorited ? '取消收藏' : '收藏项目'}
          title={favorited ? '取消收藏' : '收藏项目'}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm transition duration-200 ${
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
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-sm text-ink-faint no-underline transition duration-200 hover:border-brand/40 hover:text-brand-600"
          >
            ↗
          </a>
        )}
      </div>

      {/* 整卡可点：<a> 包住全部正文，原生支持中键 / 新标签页 / Tab 聚焦 */}
      <a
        href={href}
        aria-label={`查看 ${p.name} 详情`}
        className="block p-5 text-inherit no-underline"
      >
        {/* 头部：大号圆角图标 + 项目名 + 一行操作说明 */}
        {/* 头部右侧留出两个圆形按钮的位置（约 2×32 + 间距），
            底栏不受影响，可以吃满整卡宽度 */}
        <div className="flex items-center gap-4 pr-20">
          <ProjectLogo project={p} size="card" />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-brand-600">
              {p.name}
            </h3>
            <p className="mt-1.5 flex min-w-0 items-start gap-1.5 text-sm text-ink-soft">
              {/* 小图标 + 「操作：…」，与设计稿一致，不额外加底色 */}
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="mt-[0.3rem] h-4 w-4 shrink-0 text-ink-faint"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12.5h10.5M3.5 9.5 12 4l1.5 1.5L5 14l-2.5.5.5-2.5Z" />
              </svg>
              <span className="line-clamp-2">{actions ? `操作：${actions}` : '操作：查看项目详情'}</span>
            </p>
          </div>
        </div>

        {/* 底栏：一条分隔线 + 单行元信息 */}
        {/*
          底栏：分隔线下的单行元信息，顺序与设计稿一致 ——
            状态 → 公链 → 风险 → 价值 →（右对齐）相对验证时间 + ›

          布局要点（实测踩过的坑）：
            卡片在 1440 宽下是 440px，四项元信息 + 时间在部分语言下会超出。
            若只给容器加 min-w-0，flex 会把「公链」压成 0 宽，但容器自身
            已经被压到小于内容宽度，子元素就会**溢出卡片**并压到时间上。
            因此这里不用「压缩单项」，而是：
              · 左侧信息组可换行（flex-wrap），放不下时整体折到第二行；
              · 时间永远 shrink-0 + 贴右，绝不会被左侧文字压住。
            这样既不会溢出，也不会出现「宽度归零的隐身文字」。
        */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-line-soft pt-3 text-sm">
          <span className={`whitespace-nowrap font-medium ${STATUS_TONE[p.status]}`}>
            {STATUS_LABEL[p.status]}
          </span>
          {chain && <span className="whitespace-nowrap text-ink-soft">{chain}</span>}
          <span className="whitespace-nowrap text-ink-soft">
            风险：<span className={`font-medium ${RISK_TONE[p.scores.risk]}`}>
              {RISK_LABEL[p.scores.risk]}
            </span>
          </span>
          <span className="whitespace-nowrap text-ink-soft">
            价值：<span className="font-medium text-ink">{p.scores.grade}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-ink-faint">
            <span className="hidden sm:inline">{relativeTime(p.last_checked_at)}验证</span>
            <span aria-hidden className="text-line transition-colors group-hover:text-brand-600">
              ›
            </span>
          </span>
        </div>
      </a>
    </article>
  );
}
