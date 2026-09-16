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
import { percentileNote, percentilePhrase } from '../lib/percentile';
import { explainRiskItem, riskExplain } from '../lib/risk';
import { ExitChecklist } from '../components/ExitChecklist';
import { ScoreBreakdown } from '../components/ScoreCard';
import { ProjectLogo } from '../components/ProjectLogo';
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

const ACTION_TONE: Record<AirdropProject['recommendation']['action'], string> = {
  participate: 'text-ok',
  observe: 'text-warn',
  avoid: 'text-danger',
};

/** 详情页锚点目录：宽屏下固定在右侧，便于长页面快速跳转 */
const RISK_TONE: Record<AirdropProject['scores']['risk'], string> = {
  low: 'text-ok',
  medium: 'text-warn',
  high: 'text-danger',
  critical: 'text-danger',
};

const TOC = [
  { id: 'decision', label: '系统结论' },
  { id: 'cost', label: '成本与难度' },
  { id: 'evidence', label: '证据与来源' },
  { id: 'meta', label: '项目详情' },
  { id: 'guide', label: '参与教程' },
  { id: 'exit', label: '做完收尾' },
  { id: 'risks', label: '注意事项' },
  { id: 'faq', label: '常见问题' },
  { id: 'official', label: '官方资料' },
];

export function DetailView({
  project: p,
  favorited,
  progress,
  percentiles,
  onToggleFavorite,
  onSetProgress,
  onToggleStep,
  onBack,
}: {
  project: AirdropProject;
  favorited: boolean;
  /** 全站样本量：用于把「相对分位」说明成「本批 N 个项目中的位置」 */
  percentiles?: { authenticity?: number; value?: number; total: number };
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

  const progressPct = p.guide.length ? Math.round((done.length / p.guide.length) * 100) : 0;

  // 长页面：目录高亮当前区块 + 显示「回到顶部」
  const [activeId, setActiveId] = useState('decision');
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > 720);
      let current = TOC[0].id;
      for (const item of TOC) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= 180) current = item.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="detail-shell">
      {/* 顶部返回条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn-ghost">
          ← 返回列表
        </button>
        <nav aria-label="面包屑" className="text-sm text-ink-faint">
          <a href="#/latest" className="text-ink-faint no-underline hover:text-brand">
            首页
          </a>
          <span className="mx-2 text-line">/</span>
          {CATEGORY_LABEL[p.category]}
          <span className="mx-2 text-line">/</span>
          <span className="font-medium text-ink-soft">{p.name}</span>
        </nav>
      </div>

      {/* 1. 项目头部 */}
      <header className="relative mt-5 overflow-hidden rounded-3xl border border-line bg-white shadow-card">
        {/* 装饰：右上角光斑 + 顶部渐变线 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-brand-50/80 via-white/0 to-transparent"
        />
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-400 via-brand-600 to-accent opacity-80"
        />
        {/* 记录线：从右往左缓慢扫过，表达「这份结论是持续复核中的」，而不是一张静态海报 */}
        <span aria-hidden className="sweep-line" />

        <div className="relative flex flex-col gap-8 p-7 sm:p-9 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex items-center gap-5 lg:block">
            {/* 详情页同样使用项目真实官方 Logo，与列表页保持一致的品牌识别 */}
            <ProjectLogo project={p} size="lg" className="shadow-glow" />
            <div className="lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{CATEGORY_LABEL[p.category]}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {p.chains.map((c) => CHAIN_LABEL[c]).join(' / ')}
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-brand lg:block">{CATEGORY_LABEL[p.category]}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 lg:mt-3">
              <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">{p.name}</h1>
              <StatusBadge status={p.status} />
              <RiskBadge risk={p.scores.risk} withLabel />
            </div>
            <p className="mt-3 max-w-3xl text-lg text-ink-soft">
              {p.tagline || '暂无项目简介'}
            </p>

            <dl className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <div className="flex items-center gap-2">
                <dt className="text-ink-faint">公链</dt>
                <dd className="font-medium text-ink">
                  {p.chains.map((c) => CHAIN_LABEL[c]).join(' / ')}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-ink-faint">最近抓取</dt>
                <dd className="font-medium text-ink">{relativeTime(p.last_checked_at)}</dd>
              </div>
              <div className="flex items-center gap-2">
                {/* 与「最近抓取」区分开：抓取每 10 分钟一次，但内容往往并没有变化，
                    只有这里的时间才是「信息真的更新过」的时间 */}
                <dt className="text-ink-faint">内容更新</dt>
                <dd className="font-medium text-ink">{relativeTime(p.last_changed_at)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-ink-faint">已验证证据</dt>
                <dd className="font-medium text-ink">
                  {verifiedCount} 条 / {sourceCount} 个来源
                </dd>
              </div>
            </dl>

            {stale && (
              <p className="mt-3 inline-flex rounded-xl border border-warn/30 bg-warn-wash px-3 py-1.5 text-sm text-warn">
                ⚠ 信息可能已经变化，请以官方渠道为准
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
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
                className={`btn-ghost btn-lg ${
                  favorited ? 'border-brand/40 bg-brand-50 text-brand-700' : ''
                }`}
              >
                {favorited ? '★ 已收藏' : '☆ 收藏'}
              </button>
            </div>
            <p className="mt-4 text-sm text-ink-faint">
              外部链接将离开本站，请核对域名后再操作；任何页面都不会要求你输入助记词或私钥。
            </p>
          </div>

          {/* 宽屏：进度 + 结论放在头部右侧，打开即可见
              （顺序为「我的参与进度」在上、「系统结论」在下，按使用频率排列） */}
          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[24rem]">
            <div className="rounded-2xl border border-line bg-page/70 p-5">
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
              <p className="mt-2.5 text-sm text-ink-faint">
                {favorited ? '进度仅保存在你的浏览器本地。' : '点击「☆ 收藏」后可记录进度。'}
              </p>
            </div>

            <div className={`rounded-2xl border p-6 ${ACTION_STYLE[p.recommendation.action]}`}>
              <p className="text-xs font-semibold tracking-wide text-ink-soft">系统结论</p>
              <p className="mt-2.5 flex flex-wrap items-baseline gap-2">
                <span className={`text-3xl font-bold tracking-tight ${ACTION_TONE[p.recommendation.action]}`}>
                  {ACTION_LABEL[p.recommendation.action]}
                </span>
                <span className="text-base text-ink-soft">等级 {p.scores.grade}</span>
              </p>
              <p className="mt-3 text-base leading-relaxed text-ink">{p.recommendation.summary}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="detail-grid mt-7">
        {/* ---------- 左栏：本页目录 / 官方资料 / 再次确认结论（宽屏下位于左侧常驻） ---------- */}
        <aside className="detail-aside">
          <nav className="panel hidden !p-6 xl:block" aria-label="页面目录">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
              本页目录
            </h2>
            <ul className="mt-4 flex flex-col gap-0.5">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-base no-underline transition-all duration-200 ${
                      activeId === t.id
                        ? 'bg-brand-50 font-medium text-brand-700'
                        : 'text-ink-soft hover:bg-page'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        activeId === t.id ? 'bg-brand' : 'bg-line'
                      }`}
                    />
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="panel !p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
              官方资料
            </h2>
            {officialEntries.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">尚未核实到官方链接。</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2.5">
                {officialEntries.map(([label, url]) => (
                  <li key={label}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-white px-4 py-3 text-base no-underline text-ink transition-all duration-200 hover:-translate-y-px hover:border-brand/30 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {label}
                      <span className="text-ink-faint">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm text-ink-faint">请核对域名后再操作，谨防钓鱼站点。</p>
          </div>

          <div className="panel !p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-faint">
              再次确认结论
            </h2>
            <p
              className={`mt-4 rounded-xl border px-5 py-4 text-xl font-semibold tracking-tight ${ACTION_STYLE[p.recommendation.action]} ${ACTION_TONE[p.recommendation.action]}`}
            >
              {ACTION_LABEL[p.recommendation.action]}
            </p>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-ink-soft">真实性</dt>
                <dd className="metric">{p.scores.authenticity} / 100</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-soft">参与价值</dt>
                <dd className="metric">{p.scores.value} / 100</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-soft">风险</dt>
                <dd className="metric">{RISK_LABEL[p.scores.risk]}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-ink-faint">三项评分相互独立，不存在「总分」。</p>
          </div>
        </aside>
        {/* ---------- 右栏：正文内容（宽屏下位于右侧，空间更宽） ---------- */}
        <div className="detail-main flex min-w-0 flex-col gap-7">
          {/* 2. 三项核心评分 */}
          <section id="decision" className="scroll-mt-28">
            <h2 className="panel-title mb-4">三项独立评分</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {/* 三张评分卡：刻意保持「同样的结构、不同的语义色」——
                  三项评分互不合成总分，任何视觉上的主次都会暗示存在总分。 */}
              <button
                type="button"
                onClick={() => setShowAuth((v) => !v)}
                className={`panel lift text-left ${showAuth ? 'ring-2 ring-brand/20' : ''}`}
                aria-expanded={showAuth}
              >
                <p className="eyebrow-lg">真实性置信度</p>
                <p className="metric-lg mt-3">
                  {p.scores.authenticity}
                  <span className="ml-1.5 text-base font-normal text-ink-faint">/ 100</span>
                </p>
                <p className="mt-2 text-sm text-ink-soft">{AUTH_LEVEL(p.scores.authenticity)}</p>
                {/* P1-3：真实性分原本是一个 90% 项目都相同的常数，
                    归一化后仍然有 28% 的项目同分 —— 因为它们的证据本就同形。
                    因此这里优先展示**证据核查清单的达成数**：
                    「已核实 2/9 项」既能与同批项目横向比较，
                    也诚实表达了「我们查了什么、查到什么」。
                    分位与百分比都退为辅助信息。 */}
                {coverageSummary(p) && (
                  <p className="mt-2 text-sm font-medium text-ink-soft">{coverageSummary(p)}</p>
                )}
                <PercentileTrack pct={percentiles?.authenticity} total={percentiles?.total ?? 0} />
                <p className="detail-link mt-4">查看评分明细 {showAuth ? '↑' : '↓'}</p>
              </button>
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className={`panel lift text-left ${showValue ? 'ring-2 ring-brand/20' : ''}`}
                aria-expanded={showValue}
              >
                <p className="eyebrow-lg">参与价值</p>
                <p className="metric-lg mt-3">
                  {p.scores.value}
                  <span className="ml-1.5 text-base font-normal text-ink-faint">/ 100</span>
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  等级 {p.scores.grade} · {GRADE_DESC[p.scores.grade]}
                </p>
                <PercentileTrack pct={percentiles?.value} total={percentiles?.total ?? 0} />
                <p className="detail-link mt-4">查看评分明细 {showValue ? '↑' : '↓'}</p>
              </button>
              <button
                type="button"
                onClick={() => setShowRisk((v) => !v)}
                className={`panel lift text-left ${showRisk ? 'ring-2 ring-danger/15' : ''}`}
                aria-expanded={showRisk}
              >
                <p className="eyebrow-lg">风险等级</p>
                <p className={`metric-lg mt-3 ${RISK_TONE[p.scores.risk]}`}>
                  {RISK_LABEL[p.scores.risk]}
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  <RiskBadge risk={p.scores.risk} />
                </p>
                {/* 风险已不再只看文本关键词（P0-2）：
                    分级现在同时采信「要投入多少本金」「是否包含签名步骤」这两个结构化事实。
                    因此卡片上必须直接把理由说出来 —— 只说「高」不说「为什么高」，
                    用户依然不知道自己面对的是什么。 */}
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                  {riskBasis(p)}
                </p>
                <p className="detail-link mt-4">这意味着什么 {showRisk ? '↑' : '↓'}</p>
              </button>
            </div>
          </section>

          {showAuth && (
            <section className="panel animate-fade-up">
              <h2 className="panel-title">真实性置信度明细</h2>
              <p className="mt-2 text-sm text-ink-soft">
                基于当前公开证据判断可信程度，不代表官方保证。
              </p>
              {/* 证据核查清单：把「我们查了什么、查到什么」逐项摊开。
                  比一个看起来精确的百分比更有用 —— 用户能直接看到
                  「官方文档：未找到」「链上规模：已核实 $16754M」。 */}
              {p.scores.evidenceChecklist && p.scores.evidenceChecklist.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-base font-semibold text-ink">
                    证据核查清单（已核实 {p.scores.authenticityVerifiedCount ?? 0} 项
                    {p.scores.authenticityPartialCount ? `，部分核实 ${p.scores.authenticityPartialCount} 项` : ''}
                    ，共 {p.scores.evidenceChecklist.length} 项）
                  </h3>
                  <ul className="mt-3 divide-y divide-line-soft">
                    {p.scores.evidenceChecklist.map((c) => (
                      <li key={c.label} className="flex items-start gap-3 py-2.5">
                        <span
                          className={`mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${CHECK_TONE[c.status]}`}
                        >
                          {CHECK_LABEL[c.status]}
                        </span>
                        <span className="min-w-0 text-sm text-ink">{c.label}</span>
                        <span className="ml-auto shrink-0 text-right text-xs text-ink-soft">{c.note}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-ink-faint">
                    「不适用」表示该项对这类项目本就不存在（例如潜在项目官方还没有公告），
                    既不加分也不扣分；「未找到」表示我们查过但没有查到。
                  </p>
                </div>
              )}
              <div className="mt-4">
                <ScoreBreakdown items={p.scores.authenticityItems} />
              </div>
            </section>
          )}
          {showValue && (
            <section className="panel animate-fade-up">
              <h2 className="panel-title">参与价值明细</h2>
              <p className="mt-2 text-sm text-ink-soft">
                不代表未来收益预测，仅表达当前是否值得投入时间与成本。
              </p>
              <div className="mt-4">
                <ScoreBreakdown items={p.scores.valueItems} />
              </div>
            </section>
          )}
          {showRisk && (
            <section className="panel animate-fade-up">
              <h2 className="panel-title">风险等级明细</h2>
              <p className="mt-2 text-sm text-ink-soft">
                当前判定：{RISK_LABEL[p.scores.risk]}。下面每一条都给出「这意味着什么」与「你应该怎么做」——
                只给等级不给动作，等于把判断成本又丢回给你。
              </p>
              <RiskPlainLanguage level={p.scores.risk} />
              <div className="mt-4">
                <ScoreBreakdown items={p.scores.riskItems} />
              </div>
            </section>
          )}

          {/* 3. 成本与难度 */}
          <section id="cost" className="panel">
            <h2 className="panel-title">预计成本与操作难度</h2>
            {/* 成本四要素：横排 4 格，用细竖线分隔。
                这里刻意不用卡片：成本是一个整体判断，拆成四张卡片会让人以为是四个独立结论。 */}
            <dl className="mt-6 grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-line-soft">
              <div className="kv sm:px-4 sm:first:pl-0">
                <dt>预计资金</dt>
                <dd className="metric !text-lg">
                  {p.cost.capital_max_usd === 0
                    ? '免费'
                    : `$${p.cost.capital_min_usd}–${p.cost.capital_max_usd}`}
                </dd>
              </div>
              <div className="kv sm:px-4">
                <dt>预计 Gas</dt>
                <dd className="metric !text-lg">${p.cost.gas_estimate_usd}</dd>
              </div>
              <div className="kv sm:px-4">
                <dt>预计时间</dt>
                <dd className="metric !text-lg">{p.cost.time_minutes} 分钟</dd>
              </div>
              <div className="kv sm:px-4">
                <dt>是否需要长期交互</dt>
                <dd className="metric !text-lg">{p.cost.long_term ? '是，约 4–8 周' : '否'}</dd>
              </div>
            </dl>

            <div className="inset mt-6 flex flex-col gap-3 px-6 py-5">
              <p className="flex flex-wrap items-center gap-3 text-base text-ink">
                <span className="font-medium text-ink-soft">操作难度</span>
                <span className="text-xl tracking-[0.15em] text-warn" aria-label={`操作难度 ${difficulty} / 5`}>
                  {'★'.repeat(difficulty)}
                  <span className="text-line">{'★'.repeat(5 - difficulty)}</span>
                </span>
                <span className="metric text-base">{difficulty} / 5</span>
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
            <dl className="mt-5 flex flex-wrap gap-3">
              <div className="inset flex items-baseline gap-2 px-5 py-3">
                <dt className="text-sm text-ink-soft">已验证证据</dt>
                <dd className="metric-sm text-xl text-ok">{verifiedCount}</dd>
                <dd className="text-sm text-ink-faint">条</dd>
              </div>
              <div className="inset flex items-baseline gap-2 px-5 py-3">
                <dt className="text-sm text-ink-soft">独立来源</dt>
                <dd className="metric-sm text-xl">{sourceCount}</dd>
                <dd className="text-sm text-ink-faint">个</dd>
              </div>
            </dl>
            <ul className="mt-5 flex flex-col gap-3">
              {p.evidence.length === 0 && (
                <li className="text-base text-ink-soft">
                  尚未收集到可验证证据，本项目不应被视为已确认。
                </li>
              )}
              {p.evidence.map((e, idx) => (
                <li
                  key={`${e.type}-${idx}`}
                  className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${
                    e.verified ? 'border-ok/25 bg-ok-wash/50' : 'border-line-soft bg-page/60'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      e.verified ? 'bg-ok text-white' : 'bg-warn text-white'
                    }`}
                    aria-hidden
                  >
                    {e.verified ? '✓' : '△'}
                  </span>
                  <span className="min-w-0 text-base">
                    <span className="font-medium text-ink">{e.label}</span>
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
            <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
              <Row label="项目类型" value={CATEGORY_LABEL[p.category]} />
              <Row label="公链" value={p.chains.map((c) => CHAIN_LABEL[c]).join(' / ')} />
              <Row label="融资情况" value={p.meta?.funding ?? '未公开披露'} />
              <Row label="投资机构" value={p.meta?.investors?.join('、') || '未公开披露'} />
              <Row label="Token 状态" value={p.meta?.token_status ?? '官方暂未公布'} />
              <Row label="空投状态" value={p.meta?.airdrop_status ?? '官方暂未公布'} />
              <Row label="主要任务" value={p.tasks.join(' · ') || '暂未明确'} />
            </dl>
          </section>

          {/* 6. 新手参与教程（时间线布局） */}
          <section id="guide" className="panel">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="panel-title">新手参与教程</h2>
                {p.guide_source === 'sourced' ? (
                  <span
                    className="chip border-ok/30 bg-ok-wash text-ok"
                    title="步骤来自数据源侧抓取到的官方 HowTo，可追溯到原始页面"
                  >
                    ✓ 真实教程（可追溯来源）
                  </span>
                ) : (
                  <span
                    className="chip border-warn/30 bg-warn-wash text-warn"
                    title="数据源未提供该项目的官方步骤，以下为通用流程示意"
                  >
                    ⚠ 流程示意（非官方步骤）
                  </span>
                )}
              </div>
              <span className="chip border-line bg-page text-ink-soft">
                已完成 <strong className="metric text-ink">{done.length}</strong> / {p.guide.length} 步
              </span>
            </div>

            {/* 模板教程必须显式声明「这不是官方要求的具体步骤」，
                否则用户会把通用流程误当成项目方规定的操作，产生错误预期。 */}
            {p.guide_source === 'template' ? (
              <p className="mt-4 rounded-xl border border-warn/30 bg-warn-wash px-5 py-4 text-sm text-warn">
                该项目的数据来源暂未提供官方分步教程，以下步骤是
                <strong className="font-semibold">通用参与流程示意</strong>，用于帮助你理解大致顺序，
                不代表项目方的具体要求。请务必以
                <strong className="font-semibold">官方页面 / 官方公告</strong>的实际说明为准。
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-ok/30 bg-ok-wash px-5 py-4 text-sm text-ok">
                以下步骤来自数据源抓取到的官方 HowTo，每一步都可追溯到原始页面。
              </p>
            )}

            {/* 进度条 */}
            <div className="mt-5 flex items-center gap-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-page">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="metric shrink-0 text-sm text-ink-soft">{progressPct}%</span>
            </div>
            <p className="mt-3 text-base text-ink-soft">
              未验证步骤会明确标注。勾选状态保存在你的浏览器本地，不上传任何服务器。
            </p>

            <ol className="mt-7 flex flex-col">
              {p.guide.map((g, i) => {
                const isDone = done.includes(g.step);
                const last = i === p.guide.length - 1;
                return (
                  <li key={g.step} className="relative flex gap-5 pb-7 last:pb-0">
                    {/* 时间线轴 */}
                    <div className="flex w-12 shrink-0 flex-col items-center">
                      <span
                        className={`grid h-12 w-12 place-items-center rounded-full border-2 text-lg font-semibold transition-colors ${
                          isDone
                            ? 'border-ok bg-ok text-white'
                            : 'border-brand/25 bg-brand-50 text-brand'
                        }`}
                      >
                        {isDone ? '✓' : g.step}
                      </span>
                      {!last && <span className="mt-2 w-px flex-1 bg-line" aria-hidden />}
                    </div>

                    <div
                      className={`min-w-0 flex-1 rounded-2xl border px-6 py-6 transition-colors ${
                        isDone ? 'border-ok/30 bg-ok-wash/40' : 'border-line-soft bg-page/50'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold tracking-wide text-brand">第 {g.step} 步</p>
                          <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                            {g.title}
                          </h3>
                        </div>
                        <label className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-2.5 text-base text-ink-soft transition-colors hover:border-brand/30 hover:text-brand-700">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => onToggleStep(p.slug, g.step)}
                            className="h-5 w-5 accent-[#2563EB]"
                          />
                          已完成
                        </label>
                      </div>

                      <p className="mt-3.5 text-base leading-relaxed text-ink-soft">
                        {g.description}
                      </p>

                      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line-soft pt-5 sm:grid-cols-4">
                        <Mini label="预计耗时" value={`${g.minutes} 分钟`} />
                        <Mini label="费用" value={g.cost_usd > 0 ? `约 $${g.cost_usd}` : '免费'} />
                        <Mini label="需要连接钱包" value={g.needs_wallet ? '是' : '否'} />
                        <Mini label="风险" value={RISK_LABEL[g.risk]} />
                      </dl>

                      {g.needs_signature && (
                        <p className="mt-4 rounded-xl border border-warn/30 bg-warn-wash px-4 py-2.5 text-sm text-warn">
                          ⚠ 本步骤需要签名，请先确认签名内容。
                        </p>
                      )}
                      {g.cost_usd > 0 && (
                        <p className="mt-2 rounded-xl border border-warn/30 bg-warn-wash px-4 py-2.5 text-sm text-warn">
                          ⚠ 本步骤预计需要约 ${g.cost_usd} Gas。
                        </p>
                      )}

                      <p className="mt-3.5 text-sm text-ink-soft">
                        <span className="text-ink-faint">完成标志：</span>
                        {g.done_when}
                      </p>
                      <div className="mt-3.5 flex flex-wrap items-center gap-5">
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
                          <span className="text-sm text-ok">✓ 来源已核实</span>
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

          {/* 6.5 收尾动作：授权撤回与钱包归零。
              放在教程之后、注意事项之前 —— 用户刚读完步骤，正是需要收尾提醒的时刻。 */}
          <section id="exit" className="scroll-mt-28">
            <h2 className="panel-title mb-4">参与完成后：撤离与授权撤回</h2>
            <ExitChecklist />
          </section>

          {/* 7. 注意事项：每条都翻译成「这意味着什么 / 你应该怎么做」，
              新手看到「高风险」三个字并不知道高在哪、下一步做什么。 */}
          <section id="risks" className="panel">
            <h2 className="panel-title">注意事项与优化建议</h2>
            <p className="mt-3 text-sm text-ink-soft">
              每条都补充「这意味着什么」与「怎么办」，可以直接照着做。
            </p>
            <ul className="mt-5 flex flex-col gap-4">
              {p.risks.map((r, i) => {
                const ex = explainRiskItem(r, p.scores.risk);
                return (
                  <li
                    key={i}
                    className="rounded-2xl border border-line-soft bg-page/50 px-5 py-4"
                  >
                    <p className="flex gap-3 text-base font-medium text-ink">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                      <span>{r}</span>
                    </p>
                    <p className="mt-2.5 pl-[1.1rem] text-sm text-ink-soft">
                      <strong className="font-medium text-ink">这意味着：</strong>
                      {ex.means}
                    </p>
                    <p className="mt-1.5 pl-[1.1rem] text-sm leading-relaxed text-ink-soft">
                      <strong className="font-medium text-ink">怎么办：</strong>
                      {ex.action}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 8. FAQ */}
          <section id="faq" className="panel">
            <h2 className="panel-title">常见问题</h2>
            <ul className="mt-3 divide-y divide-line-soft">
              {p.faq.map((f, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 py-4 text-left text-lg font-medium text-ink transition-colors hover:text-brand"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                  >
                    {f.q}
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-base transition-all ${
                        openFaq === i ? 'rotate-180 border-brand/30 bg-brand-50 text-brand' : 'text-ink-faint'
                      }`}
                    >
                      {openFaq === i ? '−' : '+'}
                    </span>
                  </button>
                  {openFaq === i && (
                    <p className="animate-fade-up pb-5 pr-10 text-base leading-relaxed text-ink-soft">
                      {f.a}
                    </p>
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
              <ul className="mt-5 flex flex-wrap gap-3">
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
      </div>

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="btn-ghost fixed bottom-8 right-8 z-30 !rounded-full !px-5 shadow-lift"
          aria-label="回到页面顶部"
        >
          ↑ 回到顶部
        </button>
      )}
    </div>
  );
}

/**
 * 相对分位展示。
 *
 * 为什么必须放在绝对分旁边：实测 174/188 个项目的价值等级都是 C，
 * 用户看到一屏 C 无法判断「C 到底算好还是差」。分位给出参照系：
 * 「本批 188 个项目中相对位置前 27%」。
 *
 * ⚠️ 文案固定写「本批 N 个项目中的相对位置」——
 *   不能写成「排名」或「优于」，否则会被读成对项目本身的绝对评价，
 *   而分位只反映「在这批数据里排在哪」。
 *   样本不足（total < 2）或没有分位数据时整块不渲染，绝不编一个数字出来。
 */
/** 证据核查清单的三态 → 标签与配色 */
const CHECK_LABEL: Record<'verified' | 'partial' | 'missing' | 'not_applicable', string> = {
  verified: '已核实',
  partial: '部分核实',
  missing: '未找到',
  not_applicable: '不适用',
};

const CHECK_TONE: Record<'verified' | 'partial' | 'missing' | 'not_applicable', string> = {
  verified: 'border-ok/30 bg-ok-wash text-ok',
  partial: 'border-warn/30 bg-warn-wash text-warn',
  missing: 'border-line bg-page text-ink-soft',
  not_applicable: 'border-line-soft bg-white text-ink-faint',
};

/**
 * 真实性的一句话达成度说明（P1-3）。
 *
 * 为什么不再只显示「38/100」：
 *   实测 28% 的项目仍然同分（它们证据本就同形）。
 *   与其给一个看起来精确的伪分，不如直接说「已核实 2 / 9 项可得证据」——
 *   这是用户真正能比较、也真正能理解的信息。
 */
function coverageSummary(p: AirdropProject): string | null {
  const total = p.scores.authenticityTotalCount ?? p.scores.evidenceChecklist?.length;
  const verified = p.scores.authenticityVerifiedCount;
  if (!total || verified === undefined) return null;
  const partial = p.scores.authenticityPartialCount ?? 0;
  return `已核实 ${verified}/${total} 项证据${partial > 0 ? `（另有 ${partial} 项部分核实）` : ''}`;
}

/**
 * 风险等级的一句话依据（P0-2）。
 *
 * 为什么要写在评分卡上：
 *   修复前风险只按文本关键词推断，Aave V3 因为「存入资产 / 借出资产」里
 *   没有任何风险词而判成「低」；而卡片上同时写着「预计资金 $20–200」。
 *   现在分级改为采信结构化字段（本金、签名），那么依据就必须一起展示 ——
 *   否则用户看到一个更高的等级，却不知道是被什么抬上去的。
 */
function riskBasis(p: AirdropProject): string {
  const capital = p.cost?.capital_max_usd ?? 0;
  const signs = p.guide.some((g) => g.needs_signature);
  if (p.scores.risk === 'critical') return '检测到一票否决行为，系统不建议参与。';
  const parts: string[] = [];
  if (capital > 0) {
    // 必须标明「预估」：capital_max_usd 是流水线按关键词推断的统一上限，
    // 不是说这个项目一定要求这么多钱。实测 96 个项目的区间全是 $20–200。
    const min = p.cost?.capital_min_usd ?? 0;
    parts.push(`来源推断需投入${min > 0 ? ` $${min}–${capital}` : `约 $${capital}`} 本金（预估区间）`);
  }
  if (signs) parts.push('含需签名的链上步骤');
  if (parts.length === 0) return '未发现资金或签名要求。';
  return `判定依据：${parts.join('、')}。`;
}

function PercentileTrack({ pct, total }: { pct?: number; total: number }) {
  if (pct === undefined || total < 2) return null;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="chip border-brand/25 bg-brand-wash font-medium text-brand">
          相对位置 {percentilePhrase(pct)}
        </span>
        <span className="text-xs text-ink-faint">{percentileNote(pct, total)}</span>
      </div>
      {/* 刻度轨：「前 59%」这种说法本身有歧义（59% 是好还是差？），
          一条从 0 到 100 的轨能让用户在 0.3 秒内判断方向，无需读文字。 */}
      <span className="percentile-track mt-2 block">
        <span
          className="percentile-track__fill block"
          style={{ width: `${Math.max(4, Math.round(pct * 100))}%` }}
        />
      </span>
    </div>
  );
}

/** 风险等级的人话翻译（这意味着什么 / 怎么办） */
function RiskPlainLanguage({ level }: { level: AirdropProject['scores']['risk'] }) {
  const ex = riskExplain(level);
  return (
    <div
      className={`mt-4 rounded-2xl border px-5 py-4 ${
        ex.urgent ? 'border-danger/40 bg-danger-wash' : 'border-line-soft bg-page/60'
      }`}
    >
      <p className="text-base text-ink">
        <strong className="font-semibold">这意味着：</strong>
        {ex.means}
      </p>
      <p className="mt-2 text-base leading-relaxed text-ink">
        <strong className="font-semibold">怎么办：</strong>
        {ex.action}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-5 border-b border-line-soft pb-3.5">
      <dt className="w-32 shrink-0 text-base text-ink-faint">{label}</dt>
      <dd className="min-w-0 font-medium text-ink">{value || '—'}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <dt className="text-sm">{label}</dt>
      <dd className="metric !text-base">{value}</dd>
    </div>
  );
}
