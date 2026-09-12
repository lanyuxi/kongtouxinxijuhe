import type { AirdropProject } from '../lib/types';
import {
  AUTH_LEVEL,
  CATEGORY_LABEL,
  CHAIN_LABEL,
  GRADE_DESC,
  relativeTime,
} from '../lib/labels';
import { StatusBadge, RiskBadge } from './Badge';

function Stars({ level }: { level: number }) {
  return (
    <span aria-label={`操作难度 ${level} / 5`} className="whitespace-nowrap text-ink-soft">
      {'★'.repeat(level)}
      <span className="text-line">{'★'.repeat(5 - level)}</span>
    </span>
  );
}

/** 评分等级对应的强调色，让卡片一眼能分出优劣 */
const GRADE_TONE: Record<string, string> = {
  S: 'from-brand-500 to-accent',
  A: 'from-brand-400 to-brand-600',
  B: 'from-slate-400 to-slate-500',
  C: 'from-ink-faint to-ink-faint',
  D: 'from-ink-faint to-ink-faint',
};

/** 列表卡片：左侧标识 + 中部决策信息 + 右侧操作区 */
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
  const cta = p.status === 'claim_live' ? '查看领取教程' : '查看分析';
  const difficulty = Math.max(1, Math.min(5, Math.round(p.cost.time_minutes / 20) || 1));
  const costLabel =
    p.cost.capital_max_usd === 0 && p.cost.gas_estimate_usd === 0
      ? '免费'
      : `$${p.cost.capital_min_usd}–${p.cost.capital_max_usd}`;
  const tone = GRADE_TONE[p.scores.grade] ?? GRADE_TONE.B;

  return (
    <article className="card lift group relative overflow-hidden p-0">
      {/* 顶部渐变细线：给卡片一个「被点亮」的视觉起点 */}
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${tone} opacity-60`}
      />

      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:p-7">
        <div className="flex items-center gap-4 sm:block">
          <div
            className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tone} text-xl font-bold text-white shadow-glow`}
          >
            {p.name.slice(0, 2).toUpperCase()}
          </div>
          {/* 移动端：标识旁直接显示评分等级 */}
          <span className="chip border-line bg-page text-ink-soft sm:hidden">
            等级 {p.scores.grade}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`#/project/${p.slug}`}
              className="text-xl font-semibold tracking-tight text-ink no-underline transition-colors hover:text-brand"
            >
              {p.name}
            </a>
            <StatusBadge status={p.status} />
            <span className="hidden text-xs text-ink-faint sm:inline">
              {CATEGORY_LABEL[p.category]} · {p.chains.map((c) => CHAIN_LABEL[c]).join(' · ')}
            </span>
          </div>

          <p className="mt-2 line-clamp-2 text-base text-ink-soft">{p.tagline || '暂无项目简介'}</p>

          {/* 决策信息：用内嵌浅底块与正文分层 */}
          <dl className="inset mt-5 grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium tracking-wide text-ink-faint">真实性</dt>
              <dd className="mt-1 metric text-lg">
                {p.scores.authenticity}
                <span className="ml-1.5 text-xs font-normal text-ink-soft">
                  {AUTH_LEVEL(p.scores.authenticity)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-ink-faint">参与价值</dt>
              <dd className="mt-1 metric text-lg">
                {p.scores.value}
                <span className="ml-1.5 text-xs font-normal text-ink-soft">
                  等级 {p.scores.grade} · {GRADE_DESC[p.scores.grade]}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-ink-faint">风险</dt>
              <dd className="mt-1">
                <RiskBadge risk={p.scores.risk} />
              </dd>
            </div>
            <div className="col-span-2 border-t border-line-soft pt-4 sm:col-span-3 sm:grid sm:grid-cols-3 sm:gap-x-6">
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <dt className="text-xs font-medium tracking-wide text-ink-faint">预计成本</dt>
                <dd className="mt-1 text-base text-ink">{costLabel}</dd>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2 sm:mt-0 sm:block">
                <dt className="text-xs font-medium tracking-wide text-ink-faint">时间成本</dt>
                <dd className="mt-1 text-base text-ink">{p.cost.time_minutes} 分钟</dd>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2 sm:mt-0 sm:block">
                <dt className="text-xs font-medium tracking-wide text-ink-faint">操作难度</dt>
                <dd className="mt-1 text-base">
                  <Stars level={difficulty} />
                </dd>
              </div>
            </div>
          </dl>

          {p.tasks.length > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              <span className="font-medium text-ink-faint">主要任务：</span>
              {p.tasks.join(' · ')}
            </p>
          )}
        </div>

        {/* 操作区 */}
        <div className="flex shrink-0 items-center gap-2.5 sm:w-[11.5rem] sm:flex-col sm:items-stretch">
          <a
            href={`#/project/${p.slug}`}
            className="btn-primary flex-1 whitespace-nowrap sm:flex-none"
          >
            {cta} →
          </a>
          <button
            type="button"
            onClick={() => onToggleFavorite(p.slug)}
            aria-pressed={favorited}
            className={`btn-ghost flex-1 whitespace-nowrap sm:flex-none ${
              favorited ? 'border-brand/40 bg-brand-50 text-brand-700' : ''
            }`}
            title={favorited ? '取消收藏' : '收藏项目'}
          >
            {favorited ? '★ 已收藏' : '☆ 收藏'}
          </button>
          <span className="hidden text-center text-xs text-ink-faint sm:block">
            {relativeTime(p.last_checked_at)}验证
          </span>
        </div>
      </div>
    </article>
  );
}
