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

/** 列表卡片：身份 → 状态 → 决策信息 → 任务摘要 → CTA */
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

  return (
    <article className="card transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-brand-wash text-base font-semibold text-brand">
          {p.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          {/* 身份 + 状态 */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`#/project/${p.slug}`}
              className="text-base font-semibold text-ink no-underline hover:text-brand"
            >
              {p.name}
            </a>
            <StatusBadge status={p.status} />
            <span className="chip border-line bg-white text-ink-soft">
              {CATEGORY_LABEL[p.category]}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{p.tagline || '暂无项目简介'}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {p.chains.map((c) => CHAIN_LABEL[c]).join(' · ')}
          </p>

          {/* 决策信息 */}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-faint">真实性</dt>
              <dd className="font-semibold text-ink">
                {p.scores.authenticity}
                <span className="ml-1 text-xs font-normal text-ink-soft">
                  {AUTH_LEVEL(p.scores.authenticity)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">参与价值</dt>
              <dd className="font-semibold text-ink">
                {p.scores.value}
                <span className="ml-1 text-xs font-normal text-ink-soft">
                  {p.scores.grade} · {GRADE_DESC[p.scores.grade]}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">风险</dt>
              <dd>
                <RiskBadge risk={p.scores.risk} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">预计成本</dt>
              <dd className="text-ink">{costLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">时间成本</dt>
              <dd className="text-ink">{p.cost.time_minutes} 分钟</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">操作难度</dt>
              <dd>
                <Stars level={difficulty} />
              </dd>
            </div>
          </dl>

          {p.tasks.length > 0 && (
            <p className="mt-3 text-xs text-ink-soft">
              <span className="text-ink-faint">主要任务：</span>
              {p.tasks.join(' · ')}
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <a href={`#/project/${p.slug}`} className="btn-primary whitespace-nowrap">
            {cta} →
          </a>
          <button
            type="button"
            onClick={() => onToggleFavorite(p.slug)}
            aria-pressed={favorited}
            className="btn-ghost whitespace-nowrap"
            title={favorited ? '取消收藏' : '收藏项目'}
          >
            {favorited ? '★ 已收藏' : '☆ 收藏'}
          </button>
          <span className="hidden text-[11px] text-ink-faint sm:block">
            {relativeTime(p.last_checked_at)}验证
          </span>
        </div>
      </div>
    </article>
  );
}
