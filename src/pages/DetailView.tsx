import { useEffect, useMemo, useState } from 'react';
import type { AirdropProject } from '../lib/types';
import {
  AUTH_LEVEL,
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

/** 详情页锚点目录：宽屏下固定在右侧，便于长页面快速跳转 */
const TOC = [
  { id: 'decision', label: '系统结论' },
  { id: 'cost', label: '成本与难度' },
  { id: 'evidence', label: '证据与来源' },
  { id: 'meta', label: '项目详情' },
  { id: 'guide', label: '参与教程' },
  { id: 'risks', label: '注意事项' },
  { id: 'faq', label: '常见问题' },
  { id: 'official', label: '官方资料' },
];

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
  const sourceCount = new Set(
    p.evidence
      .filter((e) => e.url)
      .map((e) => {
        try {
          return new URL(e.url).hostname;
        } catch {
          return e.url;
        }
      }),
  ).size;

  // 长页面：目录高亮当前区块 + 显示「回到顶部」
  const [activeId, setActiveId] = useState('decision');
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > 720);
      let current = TOC[0].id;
      for (const item of TOC) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= 160) current = item.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="detail-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn-ghost">
          ← 返回列表
        </button>
        <p className="text-sm text-ink-faint">
          首页 / {CATEGORY_LABEL[p.category]} / <span className="text-ink-soft">{p.name}</span>
        </p>
      </div>

      {/* 1. 项目头部（通栏，宽屏信息分栏） */}
      <header className="panel mt-4">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-line bg-brand-wash text-3xl font-semibold text-brand">
            {p.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-ink sm:text-4xl">{p.name}</h1>
              <StatusBadge status={p.status} />
              <RiskBadge risk={p.scores.risk} withLabel />
            </div>
            <p className="mt-2.5 text-lg text-ink-soft">{p.tagline || '暂无项目简介'}</p>
            <p className="mt-2 text-sm text-ink-faint">
              {CATEGORY_LABEL[p.category]} · {p.chains.map((c) => CHAIN_LABEL[c]).join(' / ')}
              <span className="mx-2 text-line">|</span>
              最近验证 {relativeTime(p.last_checked_at)}
              {stale && <span className="ml-2 text-warn">⚠ 信息可能已经变化</span>}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {p.official.website && (
                <a
                  className="btn-primary btn-lg"
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
                className="btn-ghost btn-lg"
              >
                {favorited ? '★ 已收藏' : '☆ 收藏'}
              </button>
            </div>
            <p className="mt-3 text-sm text-ink-faint">
              外部链接将离开本站，请核对域名后再操作；任何页面都不会要求你输入助记词或私钥。
            </p>
          </div>

          {/* 宽屏：结论 + 进度放在头部右侧，打开即可见 */}
          <div className="flex shrink-0 flex-col gap-4 lg:w-[22rem]">
            <div className={`rounded-2xl border p-5 ${ACTION_STYLE[p.recommendation.action]}`}>
              <p className="text-sm text-ink-soft">系统结论</p>
              <p className="mt-1 text-xl font-semibold text-ink">
                {ACTION_LABEL[p.recommendation.action]}
                <span className="ml-2 text-base font-normal text-ink-soft">
                  等级 {p.scores.grade} · {GRADE_DESC[p.scores.grade]}
                </span>
              </p>
              <p className="mt-2 text-base leading-relaxed text-ink">{p.recommendation.summary}</p>
            </div>

            <div className="rounded-2xl border border-line bg-page p-4">
              <label className="label" htmlFor="detail-progress">
                我的参与进度
              </label>
              <select
                id="detail-progress"
                className="select w-full"
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
              <p className="mt-2 text-sm text-ink-faint">
                {favorited ? '进度仅保存在你的浏览器本地。' : '点击「☆ 收藏」后可记录进度。'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="detail-grid mt-6">
        {/* ---------- 主列 ---------- */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* 2. 三项核心评分 */}
          <section id="decision" className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setShowAuth((v) => !v)}
              className="panel text-left transition hover:border-brand/40"
              aria-expanded={showAuth}
            >
              <p className="text-base text-ink-soft">真实性置信度</p>
              <p className="mt-2 text-5xl font-semibold text-ink">
                {p.scores.authenticity}
                <span className="ml-1.5 text-base font-normal text-ink-faint">/ 100</span>
              </p>
              <p className="mt-2 text-sm text-ink-soft">{AUTH_LEVEL(p.scores.authenticity)}</p>
              <p className="mt-2 detail-link">查看评分明细 {showAuth ? '↑' : '↓'}</p>
            </button>
            <button
              type="button"
              onClick={() => setShowValue((v) => !v)}
              className="panel text-left transition hover:border-brand/40"
              aria-expanded={showValue}
            >
              <p className="text-base text-ink-soft">参与价值</p>
              <p className="mt-2 text-5xl font-semibold text-ink">
                {p.scores.value}
                <span className="ml-1.5 text-base font-normal text-ink-faint">/ 100</span>
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                等级 {p.scores.grade} · {GRADE_DESC[p.scores.grade]}
              </p>
              <p className="mt-2 detail-link">查看评分明细 {showValue ? '↑' : '↓'}</p>
            </button>
            <button
              type="button"
              onClick={() => setShowRisk((v) => !v)}
              className="panel text-left transition hover:border-brand/40"
              aria-expanded={showRisk}
            >
              <p className="text-base text-ink-soft">风险等级</p>
              <p className="mt-3">
                <RiskBadge risk={p.scores.risk} />
              </p>
              <p className="mt-3 text-sm text-ink-soft">{RISK_LABEL[p.scores.risk]}风险</p>
              <p className="mt-2 detail-link">为什么是这个等级 {showRisk ? '↑' : '↓'}</p>
            </button>
          </section>

          {showAuth && (
            <section className="panel">
              <h2 className="panel-title">真实性置信度明细</h2>
              <p className="mt-2 text-sm text-ink-soft">
                基于当前公开证据判断可信程度，不代表官方保证。
              </p>
              <div className="mt-3">
                <ScoreBreakdown items={p.scores.authenticityItems} />
              </div>
            </section>
          )}
          {showValue && (
            <section className="panel">
              <h2 className="panel-title">参与价值明细</h2>
              <p className="mt-2 text-sm text-ink-soft">
                不代表未来收益预测，仅表达当前是否值得投入时间与成本。
              </p>
              <div className="mt-3">
                <ScoreBreakdown items={p.scores.valueItems} />
              </div>
            </section>
          )}
          {showRisk && (
            <section className="panel">
              <h2 className="panel-title">风险等级明细</h2>
              <p className="mt-2 text-sm text-ink-soft">当前判定：{RISK_LABEL[p.scores.risk]}</p>
              <div className="mt-3">
                <ScoreBreakdown items={p.scores.riskItems} />
              </div>
            </section>
          )}

          {/* 3. 成本与难度 */}
          <section id="cost" className="panel">
            <h2 className="panel-title">预计成本与操作难度</h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <div className="kv">
                <dt>预计资金</dt>
                <dd className="text-lg font-semibold">
                  {p.cost.capital_max_usd === 0
                    ? '免费'
                    : `$${p.cost.capital_min_usd}–${p.cost.capital_max_usd}`}
                </dd>
              </div>
              <div className="kv">
                <dt>预计 Gas</dt>
                <dd className="text-lg font-semibold">${p.cost.gas_estimate_usd}</dd>
              </div>
              <div className="kv">
                <dt>预计时间</dt>
                <dd className="text-lg font-semibold">{p.cost.time_minutes} 分钟</dd>
              </div>
              <div className="kv">
                <dt>是否需要长期交互</dt>
                <dd className="text-lg font-semibold">{p.cost.long_term ? '是，约 4–8 周' : '否'}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-col gap-2 rounded-xl bg-page px-5 py-4">
              <p className="text-base text-ink">
                操作难度{' '}
                <span className="ml-1 text-xl tracking-wide text-warn" aria-label={`操作难度 ${difficulty} / 5`}>
                  {'★'.repeat(difficulty)}
                </span>
                <span className="text-xl tracking-wide text-line">{'★'.repeat(5 - difficulty)}</span>
                <span className="ml-2 text-sm text-ink-soft">{difficulty} / 5</span>
              </p>
              <p className="text-base text-ink-soft">{p.cost.summary}</p>
              {p.requirements.length > 0 && (
                <p className="text-base text-ink-soft">
                  <span className="text-ink-faint">参与要求：</span>
                  {p.requirements.join(' · ')}
                </p>
              )}
            </div>
          </section>

          {/* 4. Evidence 来源验证 */}
          <section id="evidence" className="panel">
            <h2 className="panel-title">证据与来源验证</h2>
            <p className="mt-2 text-base text-ink-soft">
              已验证证据 <strong className="text-ok">{verifiedCount}</strong> 条 · 独立来源{' '}
              <strong className="text-ink">{sourceCount}</strong> 个
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {p.evidence.length === 0 && (
                <li className="text-base text-ink-soft">
                  尚未收集到可验证证据，本项目不应被视为已确认。
                </li>
              )}
              {p.evidence.map((e, idx) => (
                <li
                  key={`${e.type}-${idx}`}
                  className="flex items-start gap-3 rounded-xl border border-line bg-page px-4 py-3.5"
                >
                  <span
                    className={`mt-0.5 text-lg ${e.verified ? 'text-ok' : 'text-warn'}`}
                    aria-hidden
                  >
                    {e.verified ? '✓' : '△'}
                  </span>
                  <span className="min-w-0 text-base">
                    <span className="text-ink">{e.label}</span>
                    {e.note && <span className="ml-1.5 text-sm text-ink-soft">（{e.note}）</span>}
                    {e.url && (
                      <>
                        {' '}
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm text-brand underline-offset-2 hover:underline"
                        >
                          来源 ↗
                        </a>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-faint">
              △ 表示尚未通过交叉验证。第三方来源仅作参考，不构成官方背书。
            </p>
          </section>

          {/* 5. 项目与空投详情 */}
          <section id="meta" className="panel">
            <h2 className="panel-title">项目与空投详情</h2>
            <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <Row label="项目类型" value={CATEGORY_LABEL[p.category]} />
              <Row label="公链" value={p.chains.map((c) => CHAIN_LABEL[c]).join(' / ')} />
              <Row label="融资情况" value={p.meta?.funding ?? '未公开披露'} />
              <Row label="投资机构" value={p.meta?.investors?.join('、') || '未公开披露'} />
              <Row label="Token 状态" value={p.meta?.token_status ?? '官方暂未公布'} />
              <Row label="空投状态" value={p.meta?.airdrop_status ?? '官方暂未公布'} />
              <Row label="主要任务" value={p.tasks.join(' · ') || '暂未明确'} />
            </dl>
          </section>

          {/* 6. 新手参与教程（时间线布局，比卡片堆叠更紧凑、更好读） */}
          <section id="guide" className="panel">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="panel-title">新手参与教程</h2>
              <span className="chip border-line bg-page text-ink-soft">
                已勾选 {done.length} / {p.guide.length} 步
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-page">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{
                  width: `${p.guide.length ? Math.round((done.length / p.guide.length) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="mt-3 text-base text-ink-soft">
              所有步骤均附来源，未验证步骤会明确标注。勾选状态保存在你的浏览器本地。
            </p>

            <ol className="mt-6 flex flex-col">
              {p.guide.map((g, i) => {
                const isDone = done.includes(g.step);
                const last = i === p.guide.length - 1;
                return (
                  <li key={g.step} className="relative flex gap-5 pb-6 last:pb-0">
                    {/* 时间线轴 */}
                    <div className="flex w-12 shrink-0 flex-col items-center">
                      <span
                        className={`grid h-12 w-12 place-items-center rounded-full border-2 text-lg font-semibold ${
                          isDone
                            ? 'border-ok bg-ok text-white'
                            : 'border-brand/30 bg-brand-wash text-brand'
                        }`}
                      >
                        {isDone ? '✓' : g.step}
                      </span>
                      {!last && <span className="mt-1 w-px flex-1 bg-line" aria-hidden />}
                    </div>

                    <div className="min-w-0 flex-1 rounded-2xl border border-line bg-page px-5 py-5 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold tracking-wide text-brand">
                            第 {g.step} 步
                          </p>
                          <h3 className="mt-1 text-xl font-semibold text-ink">{g.title}</h3>
                        </div>
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-base text-ink-soft">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => onToggleStep(p.slug, g.step)}
                            className="h-5 w-5 accent-[#2563EB]"
                          />
                          已完成
                        </label>
                      </div>

                      <p className="mt-3 text-base leading-relaxed text-ink-soft">{g.description}</p>

                      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
                        <Mini label="预计耗时" value={`${g.minutes} 分钟`} />
                        <Mini label="费用" value={g.cost_usd > 0 ? `约 $${g.cost_usd}` : '免费'} />
                        <Mini label="需要连接钱包" value={g.needs_wallet ? '是' : '否'} />
                        <Mini label="风险" value={RISK_LABEL[g.risk]} />
                      </dl>

                      {g.needs_signature && (
                        <p className="mt-3 rounded-lg bg-warn-wash px-3 py-2 text-sm text-warn">
                          ⚠ 本步骤需要签名，请先确认签名内容。
                        </p>
                      )}
                      {g.cost_usd > 0 && (
                        <p className="mt-2 rounded-lg bg-warn-wash px-3 py-2 text-sm text-warn">
                          ⚠ 本步骤预计需要约 ${g.cost_usd} Gas。
                        </p>
                      )}

                      <p className="mt-3 text-sm text-ink-soft">
                        <span className="text-ink-faint">完成标志：</span>
                        {g.done_when}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        {g.official_url && (
                          <a
                            className="text-sm font-medium text-brand underline-offset-2 hover:underline"
                            href={g.official_url}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            打开官方页面 ↗
                          </a>
                        )}
                        {g.source_verified ? (
                          <span className="text-sm text-ink-faint">来源已核实</span>
                        ) : (
                          <span className="text-sm text-warn">⚠ 本步骤尚未通过完整来源验证</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* 7. 注意事项 */}
          <section id="risks" className="panel">
            <h2 className="panel-title">注意事项与优化建议</h2>
            <ul className="mt-4 flex list-disc flex-col gap-2.5 pl-6 text-base text-ink-soft">
              {p.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>

          {/* 8. FAQ */}
          <section id="faq" className="panel">
            <h2 className="panel-title">常见问题</h2>
            <ul className="mt-3 divide-y divide-line">
              {p.faq.map((f, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 py-4 text-left text-lg text-ink"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                  >
                    {f.q}
                    <span className="shrink-0 text-xl text-ink-faint">{openFaq === i ? '−' : '+'}</span>
                  </button>
                  {openFaq === i && (
                    <p className="pb-4 text-base leading-relaxed text-ink-soft">{f.a}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* 9. 官方资料 */}
          <section id="official" className="panel">
            <h2 className="panel-title">官方资料</h2>
            {officialEntries.length === 0 ? (
              <p className="mt-3 text-base text-ink-soft">尚未核实到官方链接。</p>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-3">
                {officialEntries.map(([label, url]) => (
                  <li key={label}>
                    <a className="btn-ghost" href={url} target="_blank" rel="noreferrer noopener">
                      {label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 10. 问题反馈 */}
          <section className="panel">
            <h2 className="panel-title">问题反馈</h2>
            <p className="mt-3 text-base text-ink-soft">
              发现链接失效、活动已结束或信息疑似错误？请前往仓库提交 Issue，我们会尽快核实。
            </p>
            <p className="mt-2 text-sm text-ink-faint">
              本站不收集反馈数据，不使用数据库与后台系统，所有反馈通过仓库 Issue 处理。
            </p>
          </section>
        </div>

        {/* ---------- 右侧常驻栏（宽屏） ---------- */}
        <aside className="detail-aside">
          <nav className="panel hidden xl:block" aria-label="页面目录">
            <h2 className="text-base font-semibold text-ink">本页目录</h2>
            <ul className="mt-3 flex flex-col gap-1">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`block rounded-lg px-3 py-2 text-base no-underline transition-colors ${
                      activeId === t.id
                        ? 'bg-brand-wash font-medium text-brand'
                        : 'text-ink-soft hover:bg-page'
                    }`}
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="panel">
            <h2 className="text-base font-semibold text-ink">官方资料</h2>
            {officialEntries.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">尚未核实到官方链接。</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {officialEntries.map(([label, url]) => (
                  <li key={label}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-base no-underline text-ink transition-colors hover:bg-brand-wash"
                    >
                      {label}
                      <span className="text-ink-faint">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-ink-faint">请核对域名后再操作，谨防钓鱼站点。</p>
          </div>

          <div className="rounded-2xl border border-line bg-white p-6">
            <h2 className="text-base font-semibold text-ink">再次确认结论</h2>
            <p className={`mt-3 rounded-xl border px-4 py-3 text-base ${ACTION_STYLE[p.recommendation.action]}`}>
              {ACTION_LABEL[p.recommendation.action]}
            </p>
            <p className="mt-3 text-sm text-ink-soft">
              真实性 {p.scores.authenticity} / 100 · 参与价值 {p.scores.value} / 100 · 风险{' '}
              {RISK_LABEL[p.scores.risk]}
            </p>
            <p className="mt-2 text-sm text-ink-faint">三项评分相互独立，不存在「总分」。</p>
          </div>
        </aside>
      </div>

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="btn-ghost fixed bottom-8 right-8 z-30 shadow-md"
          aria-label="回到页面顶部"
        >
          ↑ 回到顶部
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 border-b border-line pb-3 last:border-0">
      <dt className="w-32 shrink-0 text-base text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-base text-ink">{value || '—'}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <dt className="text-sm">{label}</dt>
      <dd className="text-base font-medium">{value}</dd>
    </div>
  );
}
