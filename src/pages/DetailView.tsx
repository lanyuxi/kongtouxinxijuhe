import { useMemo, useState } from 'react';
import type { AirdropProject } from '../lib/types';
import {
  CATEGORY_LABEL,
  CHAIN_LABEL,
  GRADE_DESC,
  RISK_LABEL,
  isStale,
  relativeTime,
} from '../lib/labels';
import { StatusBadge, RiskBadge } from '../components/Badge';
import { ScoreBreakdown } from '../components/ScoreCard';
import type { ProgressStatus } from '../lib/store';
import { PROGRESS_LABEL } from '../lib/store';

const ACTION_STYLE: Record<AirdropProject['recommendation']['action'], string> = {
  participate: 'border-ok/30 bg-ok-wash',
  observe: 'border-warn/30 bg-warn-wash',
  avoid: 'border-danger/40 bg-danger-wash',
};

const ACTION_LABEL: Record<AirdropProject['recommendation']['action'], string> = {
  participate: '建议参与',
  observe: '谨慎观察',
  avoid: '不建议参与',
};

export function DetailView({
  project: p,
  favorited,
  progress,
  onToggleFavorite,
  onSetProgress,
  onToggleStep,
  onBack,
}: {
  project: AirdropProject;
  favorited: boolean;
  progress?: { status: ProgressStatus; completed_steps: number[] };
  onToggleFavorite: (slug: string) => void;
  onSetProgress: (slug: string, s: ProgressStatus) => void;
  onToggleStep: (slug: string, step: number) => void;
  onBack: () => void;
}) {
  const [showAuth, setShowAuth] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const done = progress?.completed_steps ?? [];
  const officialEntries = useMemo(
    () =>
      (
        [
          ['官网', p.official.website],
          ['X', p.official.x],
          ['Discord', p.official.discord],
          ['Docs', p.official.docs],
          ['GitHub', p.official.github],
          ['Galxe', p.official.galxe],
        ] as const
      ).filter(([, url]) => !!url),
    [p.official],
  );

  const stale = isStale(p.last_checked_at);
  const difficulty = Math.max(1, Math.min(5, Math.round(p.cost.time_minutes / 20) || 1));
  const verifiedCount = p.evidence.filter((e) => e.verified).length;

  return (
    <div className="mx-auto flex max-w-prose flex-col gap-5">
      <button type="button" onClick={onBack} className="btn-ghost self-start">
        ← 返回列表
      </button>

      {/* 1. 项目头部 */}
      <header className="card">
        <div className="flex items-start gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-line bg-brand-wash text-2xl font-semibold text-brand">
            {p.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink sm:text-2xl">{p.name}</h1>
              <StatusBadge status={p.status} />
              <RiskBadge risk={p.scores.risk} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">{p.tagline || '暂无项目简介'}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {CATEGORY_LABEL[p.category]} · {p.chains.map((c) => CHAIN_LABEL[c]).join(' / ')}
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              最近验证 {relativeTime(p.last_checked_at)}
              {stale && <span className="ml-2 text-warn">⚠ 信息可能已经变化</span>}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          {p.official.website && (
            <a
              className="btn-primary"
              href={p.official.website}
              target="_blank"
              rel="noreferrer noopener"
            >
              前往官方活动 ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => onToggleFavorite(p.slug)}
            aria-pressed={favorited}
            className="btn-ghost"
          >
            {favorited ? '★ 已收藏' : '☆ 收藏'}
          </button>
          <select
            aria-label="参与进度"
            className="select"
            value={progress?.status ?? 'none'}
            onChange={(e) => onSetProgress(p.slug, e.target.value as ProgressStatus)}
            disabled={!favorited}
            title={favorited ? '设置参与进度' : '先收藏后可设置进度'}
          >
            {(['saved', 'preparing', 'doing', 'done'] as const).map((s) => (
              <option key={s} value={s}>
                {PROGRESS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          外部链接将离开本站，请核对域名后再操作。
        </p>
      </header>

      {/* 2. 系统结论 */}
      <section className={`card border ${ACTION_STYLE[p.recommendation.action]}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-ink">系统结论</span>
          <span className="chip border-line bg-white text-ink">
            {ACTION_LABEL[p.recommendation.action]}
          </span>
          <span className="chip border-line bg-white text-ink-soft">
            等级 {p.scores.grade} · {GRADE_DESC[p.scores.grade]}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink">{p.recommendation.summary}</p>
      </section>

      {/* 3. 三项核心评分 */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setShowAuth((v) => !v)}
          className="card text-left transition hover:border-brand/40"
          aria-expanded={showAuth}
        >
          <p className="text-xs text-ink-soft">真实性置信度</p>
          <p className="mt-1.5 text-3xl font-semibold text-ink">
            {p.scores.authenticity}
            <span className="ml-1 text-sm font-normal text-ink-faint">/ 100</span>
          </p>
          <p className="mt-1 text-xs text-brand">查看评分明细 {showAuth ? '↑' : '↓'}</p>
        </button>
        <button
          type="button"
          onClick={() => setShowValue((v) => !v)}
          className="card text-left transition hover:border-brand/40"
          aria-expanded={showValue}
        >
          <p className="text-xs text-ink-soft">参与价值</p>
          <p className="mt-1.5 text-3xl font-semibold text-ink">
            {p.scores.value}
            <span className="ml-1 text-sm font-normal text-ink-faint">/ 100</span>
          </p>
          <p className="mt-1 text-xs text-brand">查看评分明细 {showValue ? '↑' : '↓'}</p>
        </button>
        <button
          type="button"
          onClick={() => setShowRisk((v) => !v)}
          className="card text-left transition hover:border-brand/40"
          aria-expanded={showRisk}
        >
          <p className="text-xs text-ink-soft">风险等级</p>
          <p className="mt-1.5">
            <RiskBadge risk={p.scores.risk} />
          </p>
          <p className="mt-1 text-xs text-brand">为什么是这个等级 {showRisk ? '↑' : '↓'}</p>
        </button>
      </section>

      {showAuth && (
        <section className="card">
          <h2 className="mb-1 text-lg font-semibold text-ink">真实性置信度明细</h2>
          <p className="mb-2 text-xs text-ink-soft">
            基于当前公开证据判断可信程度，不代表官方保证。
          </p>
          <ScoreBreakdown items={p.scores.authenticityItems} />
        </section>
      )}
      {showValue && (
        <section className="card">
          <h2 className="mb-1 text-lg font-semibold text-ink">参与价值明细</h2>
          <p className="mb-2 text-xs text-ink-soft">不代表未来收益预测，仅表达当前是否值得投入时间与成本。</p>
          <ScoreBreakdown items={p.scores.valueItems} />
        </section>
      )}
      {showRisk && (
        <section className="card">
          <h2 className="mb-1 text-lg font-semibold text-ink">风险等级明细</h2>
          <p className="mb-2 text-xs text-ink-soft">
            当前判定：{RISK_LABEL[p.scores.risk]}
          </p>
          <ScoreBreakdown items={p.scores.riskItems} />
        </section>
      )}

      {/* 4. 成本与难度 */}
      <section className="card">
        <h2 className="text-lg font-semibold text-ink">预计成本与操作难度</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-faint">预计资金</dt>
            <dd className="text-ink">
              {p.cost.capital_max_usd === 0 ? '免费' : `$${p.cost.capital_min_usd}–${p.cost.capital_max_usd}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">预计 Gas</dt>
            <dd className="text-ink">${p.cost.gas_estimate_usd}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">预计时间</dt>
            <dd className="text-ink">{p.cost.time_minutes} 分钟</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">是否需要长期交互</dt>
            <dd className="text-ink">{p.cost.long_term ? '是，约 4–8 周' : '否'}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-soft">
          操作难度：{'★'.repeat(difficulty)}
          <span className="text-line">{'★'.repeat(5 - difficulty)}</span>
        </p>
        <p className="mt-1 text-sm text-ink">{p.cost.summary}</p>
        {p.requirements.length > 0 && (
          <p className="mt-2 text-xs text-ink-soft">
            <span className="text-ink-faint">参与要求：</span>
            {p.requirements.join(' · ')}
          </p>
        )}
      </section>

      {/* 5. Evidence 来源验证 */}
      <section className="card">
        <h2 className="text-lg font-semibold text-ink">证据与来源验证</h2>
        <p className="mt-1 text-xs text-ink-soft">
          已验证证据 {verifiedCount} 条 · 独立来源 {new Set(p.evidence.filter((e) => e.url).map((e) => {
            try {
              return new URL(e.url).hostname;
            } catch {
              return e.url;
            }
          })).size} 个
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {p.evidence.length === 0 && (
            <li className="text-sm text-ink-soft">尚未收集到可验证证据，本项目不应被视为已确认。</li>
          )}
          {p.evidence.map((e, idx) => (
            <li key={`${e.type}-${idx}`} className="flex items-start gap-2 text-sm">
              <span className={e.verified ? 'text-ok' : 'text-warn'} aria-hidden>
                {e.verified ? '✓' : '△'}
              </span>
              <span className="min-w-0">
                <span className="text-ink">{e.label}</span>
                {e.note && <span className="ml-1 text-xs text-ink-soft">（{e.note}）</span>}
                {e.url && (
                  <>
                    {' '}
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-brand underline-offset-2 hover:underline"
                    >
                      来源 ↗
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-faint">
          △ 表示尚未通过交叉验证。第三方来源仅作参考，不构成官方背书。
        </p>
      </section>

      {/* 6. 项目与空投详情 */}
      <section className="card">
        <h2 className="text-lg font-semibold text-ink">项目与空投详情</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row label="项目类型" value={CATEGORY_LABEL[p.category]} />
          <Row label="公链" value={p.chains.map((c) => CHAIN_LABEL[c]).join(' / ')} />
          <Row label="融资情况" value={p.meta?.funding ?? '未公开披露'} />
          <Row label="投资机构" value={p.meta?.investors?.join('、') || '未公开披露'} />
          <Row label="Token 状态" value={p.meta?.token_status ?? '官方暂未公布'} />
          <Row label="空投状态" value={p.meta?.airdrop_status ?? '官方暂未公布'} />
          <Row label="主要任务" value={p.tasks.join(' · ') || '暂未明确'} />
        </dl>
      </section>

      {/* 7. 新手参与教程 */}
      <section className="card" id="guide">
        <h2 className="text-lg font-semibold text-ink">新手参与教程</h2>
        <p className="mt-1 text-xs text-ink-soft">
          已勾选 {done.length} / {p.guide.length} 步。所有步骤均附来源，未验证步骤会明确标注。
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          {p.guide.map((g) => {
            const isDone = done.includes(g.step);
            return (
              <li key={g.step} className="rounded-xl border border-line bg-page p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand">Step {g.step}</p>
                    <h3 className="mt-1 text-base font-semibold text-ink">{g.title}</h3>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => onToggleStep(p.slug, g.step)}
                      className="h-4 w-4 accent-[#2563EB]"
                    />
                    已完成
                  </label>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{g.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Mini label="预计耗时" value={`${g.minutes} 分钟`} />
                  <Mini label="费用" value={g.cost_usd > 0 ? `约 $${g.cost_usd}` : '免费'} />
                  <Mini label="需要连接钱包" value={g.needs_wallet ? '是' : '否'} />
                  <Mini label="风险" value={RISK_LABEL[g.risk]} />
                </dl>
                {g.needs_signature && (
                  <p className="mt-2 text-xs text-warn">⚠ 本步骤需要签名，请先确认签名内容。</p>
                )}
                {g.cost_usd > 0 && (
                  <p className="mt-1 text-xs text-warn">⚠ 本步骤预计需要约 ${g.cost_usd} Gas。</p>
                )}
                <p className="mt-2 text-xs text-ink-soft">
                  <span className="text-ink-faint">完成标志：</span>
                  {g.done_when}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {g.official_url && (
                    <a
                      className="text-xs text-brand underline-offset-2 hover:underline"
                      href={g.official_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      打开官方页面 ↗
                    </a>
                  )}
                  {g.source_verified ? (
                    <span className="text-xs text-ink-faint">来源已核实</span>
                  ) : (
                    <span className="text-xs text-warn">⚠ 本步骤尚未通过完整来源验证</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 8. 注意事项 */}
      <section className="card">
        <h2 className="text-lg font-semibold text-ink">注意事项与优化建议</h2>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-soft">
          {p.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      {/* 9. FAQ */}
      <section className="card">
        <h2 className="text-lg font-semibold text-ink">常见问题</h2>
        <ul className="mt-3 divide-y divide-line">
          {p.faq.map((f, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm text-ink"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                {f.q}
                <span className="text-ink-faint">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <p className="pb-3 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 10. 官方资料 */}
      <section className="card">
        <h2 className="text-lg font-semibold text-ink">官方资料</h2>
        {officialEntries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">尚未核实到官方链接。</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {officialEntries.map(([label, url]) => (
              <li key={label}>
                <a
                  className="btn-ghost"
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {label} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 11. 问题反馈 */}
      <section className="card">
        <h2 className="text-lg font-semibold text-ink">问题反馈</h2>
        <p className="mt-1 text-sm text-ink-soft">
          发现链接失效、活动已结束或信息疑似错误？请前往仓库提交 Issue，我们会尽快核实。
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          本站不收集反馈数据，不使用数据库与后台系统，所有反馈通过仓库 Issue 处理。
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ink">{value || '—'}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
