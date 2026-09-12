import type { AirdropProject } from '../lib/types';
import {
  CHAIN_LABEL,
  GRADE_DESC,
  RISK_LABEL,
  STATUS_LABEL,
  relativeTime,
} from '../lib/labels';
import { operationLine } from '../lib/tasks';
import { ProjectLogo } from './ProjectLogo';

/**
 * 项目卡片（紧凑型）。
 *
 * 设计参考：竞品列表的信息分层方式 ——
 *   左上：项目官方 Logo（真实图标，不用字母占位）
 *   右上：状态标签组 + 收藏按钮
 *   主体：项目名 → 「操作：xxx」一行说明
 *   底部：关键条件（领取截止 / 公链）+ 风险与新鲜度
 *
 * 交互约定（本次需求）：
 *   整张卡片就是进入详情页的入口，因此不再单独放「查看详情」按钮。
 *   卡片用 <a> 包住正文，收藏按钮作为独立控件浮在上层，
 *   保证「点卡片进详情」与「点星标收藏」互不干扰。
 */

/**
 * 等级 → 卡片顶部细线的强调色。
 * 注意：这里只影响细线，不再给 Logo 上色 ——
 * Logo 已经是项目真实的官方图标，套品牌渐变会破坏品牌识别。
 */
const GRADE_TONE: Record<string, { line: string }> = {
  S: { line: 'from-brand-500 via-accent to-brand-400' },
  A: { line: 'from-brand-400 to-brand-600' },
  B: { line: 'from-slate-300 to-slate-400' },
  C: { line: 'from-line to-line-soft' },
  D: { line: 'from-line to-line-soft' },
};

const STATUS_DOT_TONE: Record<string, string> = {
  new: 'bg-brand',
  potential: 'bg-warn',
  confirmed: 'bg-ok',
  claim_live: 'bg-warn',
  ended: 'bg-ink-faint',
};

/** 状态标签：浅底 + 圆点，和参考图一致 */
function StatusPill({ status }: { status: AirdropProject['status'] }) {
  const active = status === 'confirmed' || status === 'claim_live';
  return (
    <span
      className={`chip ${
        active ? 'border-ok/40 bg-ok-wash text-ok' : 'border-line bg-white text-ink-soft'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_TONE[status]}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

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
  const tone = GRADE_TONE[p.scores.grade] ?? GRADE_TONE.C;
  const href = `#/project/${p.slug}`;
  const chain = p.chains[0] ? CHAIN_LABEL[p.chains[0]] : '';

  // 「领取截止」线索：从 FAQ / 描述里找相对时间，找不到就不显示（不编造）
  const deadline = findDeadline(p);

  return (
    /*
     * 整卡可点击：用 <a> 直接包住卡片正文，而不是在卡片外挂 onClick。
     * 这样「整卡进入详情」是原生链接行为：
     *   · 支持中键 / 右键「在新标签页打开」
     *   · 键盘 Tab 能聚焦，屏幕阅读器能识别为链接
     *   · 不需要 JS，也不会和内部的收藏按钮抢事件
     * 收藏按钮之所以仍能独立工作，是因为它在 DOM 上是嵌套的交互元素，
     * 浏览器会优先响应内层按钮，不会触发外层链接跳转。
     */
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card transition duration-300 ease-out hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card-hover focus-within:border-brand/40">
      {/* 顶部等级细线：不占空间，但能让卡片「有等级」 */}
      <span aria-hidden className={`h-[3px] w-full bg-gradient-to-r ${tone.line}`} />

      <a
        href={href}
        aria-label={`查看 ${p.name} 详情`}
        className="flex flex-1 flex-col gap-3.5 p-5 text-inherit no-underline"
      >
        {/* 头部：Logo + 状态 */}
        <div className="flex items-start gap-3.5">
          <ProjectLogo project={p} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <StatusPill status={p.status} />
            {p.status === 'confirmed' && (
              <span className="chip border-ok/30 bg-ok-wash text-ok">已确认</span>
            )}
            {p.scores.grade === 'S' && (
              <span className="chip border-accent/30 bg-accent-wash text-accent">
                {GRADE_DESC.S}
              </span>
            )}
          </div>
        </div>

        {/* 项目名：卡片标题，hover 变色提示「整卡可点」 */}
        <h3 className="line-clamp-1 text-xl font-semibold tracking-tight text-ink transition-colors group-hover:text-brand">
          {p.name}
        </h3>

        {/* 操作说明：卡片的信息主体，来自真实教程步骤 */}
        <p className="line-clamp-3 min-h-[4.2rem] text-sm leading-relaxed text-ink-soft">
          <span className="text-ink-faint">✎ </span>
          {operationLine(p)}
        </p>

        {/* 关键条件：只有真的有信息时才渲染，避免空行 */}
        {(deadline || chain) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            {deadline && (
              <span className="chip border-warn/30 bg-warn-wash text-warn">{deadline}</span>
            )}
            {chain && <span className="text-ink-faint">{chain}</span>}
          </div>
        )}

        {/* 页脚元信息：风险与新鲜度，弱化处理 */}
        <div className="mt-auto flex items-center justify-between border-t border-line-soft pt-3 text-xs text-ink-faint">
          <span>
            风险 <strong className={riskTone(p.scores.risk)}>{RISK_LABEL[p.scores.risk]}</strong>
            <span className="mx-1.5 text-line">·</span>
            价值 {p.scores.grade}
          </span>
          <span className="inline-flex items-center gap-1">
            {relativeTime(p.last_checked_at)}验证
            {/* 明确的「可进入」提示，替代原来的「查看详情」按钮 */}
            <span aria-hidden className="text-brand transition-transform group-hover:translate-x-0.5">
              ›
            </span>
          </span>
        </div>
      </a>

      {/*
        收藏按钮与官网入口浮在卡片右上角、覆盖在链接之上。
        用绝对定位而不是放进 <a> 里：<a> 内不能再嵌 <a> / <button> 之外的可交互元素，
        而且绝对定位后点击区域不会被链接吞掉。
      */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onToggleFavorite(p.slug)}
          aria-pressed={favorited}
          aria-label={favorited ? '取消收藏' : '收藏项目'}
          title={favorited ? '取消收藏' : '收藏项目'}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-base transition duration-200 ${
            favorited
              ? 'border-brand/40 bg-brand-50 text-brand-700'
              : 'border-line bg-white/95 text-ink-faint hover:border-brand/40 hover:text-brand'
          }`}
        >
          {favorited ? '★' : '☆'}
        </button>
        {p.official.website && (
          <a
            href={p.official.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="前往官方页面"
            aria-label={`前往 ${p.name} 官方页面`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-white/95 text-sm text-ink-faint no-underline transition duration-200 hover:border-brand/40 hover:text-brand"
          >
            ↗
          </a>
        )}
      </div>
    </article>
  );
}

function riskTone(risk: AirdropProject['scores']['risk']): string {
  if (risk === 'critical' || risk === 'high') return 'text-danger';
  if (risk === 'medium') return 'text-warn';
  return 'text-ok';
}

/**
 * 从 FAQ / 描述里提取「领取截止」这类时间线索。
 * 只认明确的「剩余 N 天 / 截止日期」表述 —— 拿不到就返回 null，不编造。
 */
function findDeadline(p: AirdropProject): string | null {
  const texts = [
    ...p.faq.map((f) => f.a),
    ...p.faq.map((f) => f.q),
    p.meta?.airdrop_status ?? '',
    p.cost.summary,
  ];
  for (const t of texts) {
    const m = t.match(/剩余\s*(\d+)\s*天/);
    if (m) return `剩余 ${m[1]} 天`;
    const d = t.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (d) return `截止 ${d[2]}/${d[3]}`;
  }
  return null;
}
