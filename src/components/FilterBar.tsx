import type { Filters, SortKey } from '../lib/filter';
import { SORT_LABEL } from '../lib/filter';
import { STATUS_LABEL, CATEGORY_LABEL, CHAIN_LABEL, RISK_LABEL } from '../lib/labels';
import { BEGINNER_RULES } from '../lib/beginner';

const STATUSES = ['all', 'new', 'potential', 'confirmed', 'claim_live', 'ended'] as const;
const CHAINS = [
  'all',
  'Ethereum',
  'Solana',
  'Base',
  'Arbitrum',
  'Optimism',
  'BNB Chain',
  'Sui',
  'Other',
] as const;
const CATEGORIES = [
  'all',
  'DeFi',
  'L2',
  'AI',
  'DePIN',
  'GameFi',
  'Social',
  'Infra',
  'NFT',
  'Other',
] as const;
const RISKS = ['all', 'low', 'medium', 'high', 'critical'] as const;
const COSTS = [
  { key: 'all', label: '全部成本' },
  { key: 'free', label: '免费' },
  { key: 'lt10', label: '< $10' },
  { key: '10to100', label: '$10–100' },
  { key: 'gt100', label: '> $100' },
] as const;

export function FilterBar({
  filters,
  onChange,
  onReset,
  resultCount,
  mergedVariants = 0,
  activeOverview = null,
  onClearOverview,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  resultCount: number;
  /**
   * 被折叠为「同协议产品线」的条目数。
   *
   * 为什么必须显示：筛选结果里有 188 个项目，但同协议归组后只渲染 167 张卡片。
   * 若计数仍写 188，用户会以为少了 21 个项目（或以为页面坏了）。
   * 因此这里如实拆开：「共 X 张卡片（含 Y 条同协议产品线已折叠）」。
   */
  mergedVariants?: number;
  /**
   * 当前生效的「数据总览」口径名称（点击上方磁贴产生）。
   *
   * 为什么筛选区必须显示它：口径是加在筛选条件**之上**的一层收敛，
   * 一旦用户忘了自己点过磁贴，就会把「筛出来怎么变少了」当成 Bug。
   * 因此这里如实回显，并给一个就地移除的入口，不必再滚回顶部找磁贴。
   */
  activeOverview?: string | null;
  onClearOverview?: () => void;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });

  /**
   * 新手友好开关的键盘支持。
   *
   * 这里刻意用原生 <button>：它天然支持 Tab 聚焦与 Enter / Space 触发。
   * 早期版本用自定义 div 按钮组，结果是没有 role、不能聚焦、
   * 读屏用户完全感知不到这个开关存在 —— 而它恰恰是新手最主要的入口。
   * 现在只有这一个组合开关需要方向键组语义，用 aria-pressed 表达开关状态即可，
   * 不额外引入 roving tabindex（那是单选组才需要的复杂语义）。
   */
  return (
    <section className="card" aria-labelledby="filter-title">
      {/* 头部：标题 + 结果计数，明确「这是筛选区」 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 与 StatBar / 详情页统一：分区标题都用 .panel-title 的色条语言，
            这样用户在长页面里滚动时能靠「有没有色条」判断自己在哪个层级 */}
        <h2 id="filter-title" className="panel-title">
          筛选与排序
        </h2>
        {/* 结果计数对读屏用户同样重要：筛选后「结果从 188 变成 7」必须能被感知，
            否则读屏用户点完筛选没有任何反馈，只能怀疑自己点错了。
            用 role=status + aria-live=polite：不打断当前朗读，但会播报新结果数。 */}
        <p className="text-sm text-ink-soft" role="status" aria-live="polite">
          共 <strong className="metric text-base text-ink">{resultCount}</strong> 张卡片
          {mergedVariants > 0 && (
            <span className="text-ink-faint">
              （另有 <strong className="metric text-ink-faint">{mergedVariants}</strong> 条同协议产品线已合并展示）
            </span>
          )}
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-5">
        {/* 总览口径回显：只在生效时出现，避免长期占位变成噪音 */}
        {activeOverview && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/25 bg-brand-50 px-4 py-3">
            <span className="text-xs text-ink-soft" role="status" aria-live="polite">
              已按数据总览口径筛选：
              <strong className="ml-1 font-medium text-brand-700">{activeOverview}</strong>
            </span>
            <button
              type="button"
              onClick={() => onClearOverview?.()}
              className="chip border-brand/30 bg-white text-brand-700 transition hover:border-brand hover:bg-brand-50"
              aria-label={`取消「${activeOverview}」筛选`}
            >
              ✕ 取消该口径
            </button>
          </div>
        )}

        {/* 搜索框：独立一行并加大，作为主操作 */}
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
          >
            ⌕
          </span>
          <input
            type="search"
            value={filters.keyword}
            onChange={(e) => set('keyword', e.target.value)}
            placeholder="搜索项目名称、任务或公链…"
            aria-label="搜索项目"
            className="select w-full py-3.5 pl-11 text-base shadow-sm"
          />
        </div>

        {/* 新手友好：单独一条醒目开关。
            小白的第一诉求是「有没有我现在就能做的」，而不是逐个调筛选器。
            因此把它做成一眼可见、一键切换的入口，而非藏在某个下拉框里。 */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line-soft bg-page/60 px-4 py-3">
          <button
            type="button"
            onClick={() => set('beginner', filters.beginner === 'friendly' ? 'all' : 'friendly')}
            aria-pressed={filters.beginner === 'friendly'}
            aria-label={`只看新手友好，当前${filters.beginner === 'friendly' ? '已开启' : '未开启'}`}
            title="只看无需本金、Gas 低、风险可控、无需签名授权的项目"
            className={`chip transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 ${
              filters.beginner === 'friendly'
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-white text-ink-soft hover:border-brand/40 hover:text-brand-600'
            }`}
          >
            🌱 只看新手友好
          </button>
          <span className="text-xs text-ink-faint" id="beginner-hint">
            筛选条件：无需本金 · Gas ≤ ${BEGINNER_RULES.maxGasUsd} · 风险可控 · 无需签名授权
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="f-status">状态</label>
            <select
              id="f-status"
              className="select w-full"
              value={filters.status}
              onChange={(e) => set('status', e.target.value as Filters['status'])}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? '全部状态' : STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="f-chain">公链</label>
            <select
              id="f-chain"
              className="select w-full"
              value={filters.chain}
              onChange={(e) => set('chain', e.target.value as Filters['chain'])}
            >
              {CHAINS.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? '全部公链' : CHAIN_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="f-cat">类型</label>
            <select
              id="f-cat"
              className="select w-full"
              value={filters.category}
              onChange={(e) => set('category', e.target.value as Filters['category'])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? '全部类型' : CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="f-risk">风险</label>
            <select
              id="f-risk"
              className="select w-full"
              value={filters.risk}
              onChange={(e) => set('risk', e.target.value as Filters['risk'])}
            >
              {RISKS.map((r) => (
                <option key={r} value={r}>
                  {r === 'all' ? '全部风险' : RISK_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="f-cost">成本</label>
            <select
              id="f-cost"
              className="select w-full"
              value={filters.cost}
              onChange={(e) => set('cost', e.target.value as Filters['cost'])}
            >
              {COSTS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft pt-5 text-sm">
          <span className="flex items-center gap-2 text-ink-soft">
            排序
            <select
              aria-label="排序方式"
              className="select"
              value={filters.sort}
              onChange={(e) => set('sort', e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </span>
          <button type="button" onClick={onReset} className="btn-quiet ml-auto">
            重置筛选 ↺
          </button>
        </div>
      </div>
    </section>
  );
}
