import type { AirdropProject } from '../lib/types';
import {
  CHAIN_LABEL,
  GRADE_DESC,
  RISK_LABEL,
  STATUS_LABEL,
  relativeTime,
} from '../lib/labels';
import { operationLine } from '../lib/tasks';

/**
 * 项目卡片（紧凑型）。
 *
 * 设计参考：竞品列表的信息分层方式 ——
 *   左上：方形 Logo
 *   右上：状态标签组 + 收藏按钮
 *   主体：项目名 → 「操作：xxx」一行说明
 *   底部：关键条件（领取截止 / 公链）+ 操作按钮
 *
 * 与旧版的区别：旧版把三项评分、成本、难度全摊在卡片上，信息过载；
 * 新版只保留「决定是否点进去」所需的最少信息，详细评分留在详情页。
 */

/** 等级 → 强调色（顶部细线 + Logo 底色） */
const GRADE_TONE: Record<string, { line: string; logo: string }> = {
  S: { line: 'from-brand-500 via-accent to-brand-400', logo: 'from-brand-500 to-accent' },
  A: { line: 'from-brand-400 to-brand-600', logo: 'from-brand-400 to-brand-600' },
  B: { line: 'from-slate-300 to-slate-400', logo: 'from-slate-400 to-slate-500' },
  C: { line: 'from-line to-line-soft', logo: 'from-ink-faint to-slate-400' },
  D: { line: 'from-line to-line-soft', logo: 'from-ink-faint to-ink-faint' },
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

/** 项目标识：无图时用首字母，避免出现破图 */
function ProjectLogo({ project, tone }: { project: AirdropProject; tone: string }) {
  const initials = project.name.replace(/[^A-Za-z\u4e00-\u9fa5]/g, '').slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tone} text-lg font-bold text-white shadow-glow`}
    >
      {initials || '?'}
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
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card transition duration-300 ease-out hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card-hover">
      {/* 顶部等级细线：不占空间，但能让卡片「有等级」 */}
      <span aria-hidden className={`h-[3px] w-full bg-gradient-to-r ${tone.line}`} />

      <div className="flex flex-1 flex-col gap-3.5 p-5">
        {/* 头部：Logo + 状态 / 收藏 */}
        <div className="flex items-start gap-3.5">
          <ProjectLogo project={p} tone={tone.logo} />
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
          <button
            type="button"
            onClick={() => onToggleFavorite(p.slug)}
            aria-pressed={favorited}
            aria-label={favorited ? '取消收藏' : '收藏项目'}
            title={favorited ? '取消收藏' : '收藏项目'}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-base transition duration-200 ${
              favorited
                ? 'border-brand/40 bg-brand-50 text-brand-700'
                : 'border-line bg-white text-ink-faint hover:border-brand/40 hover:text-brand'
            }`}
          >
            {favorited ? '★' : '☆'}
          </button>
        </div>

        {/* 项目名：可点击，是整个卡片的主入口 */}
        <a
          href={href}
          className="line-clamp-1 text-xl font-semibold tracking-tight text-ink no-underline transition-colors hover:text-brand"
        >
          {p.name}
        </a>

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

        {/* 底部操作区 */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <a href={href} className="btn-primary flex-1 !px-4 !py-2.5 text-sm">
            查看详情
          </a>
          {p.official.website && (
            <a
              href={p.official.website}
              target="_blank"
              rel="noopener noreferrer"
              title="前往官方页面"
              aria-label="前往官方页面"
              className="btn-ghost !px-4 !py-2.5 text-sm"
            >
              ↗
            </a>
          )}
        </div>

        {/* 页脚元信息：风险与新鲜度，弱化处理 */}
        <div className="flex items-center justify-between border-t border-line-soft pt-3 text-xs text-ink-faint">
          <span>
            风险 <strong className={riskTone(p.scores.risk)}>{RISK_LABEL[p.scores.risk]}</strong>
            <span className="mx-1.5 text-line">·</span>
            价值 {p.scores.grade}
          </span>
          <span>{relativeTime(p.last_checked_at)}验证</span>
        </div>
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
