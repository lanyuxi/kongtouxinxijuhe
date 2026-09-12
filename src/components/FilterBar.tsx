import type { Filters, SortKey } from '../lib/filter';
import { SORT_LABEL } from '../lib/filter';
import { STATUS_LABEL, CATEGORY_LABEL, CHAIN_LABEL, RISK_LABEL } from '../lib/labels';

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
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  resultCount: number;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });

  return (
    <section className="card">
      <div className="flex flex-col gap-4">
        <input
          type="search"
          value={filters.keyword}
          onChange={(e) => set('keyword', e.target.value)}
          placeholder="搜索项目名称、任务或公链…"
          aria-label="搜索项目"
          className="select w-full"
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
              onChange={(e) => set('category', e.target.value)}
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

          <div>
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

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-ink-soft">
            排序
            <select
              aria-label="排序方式"
              className="select ml-2"
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
          <span className="text-ink-soft">
            共 <strong className="text-ink">{resultCount}</strong> 个项目
          </span>
          <button type="button" onClick={onReset} className="btn-ghost ml-auto">
            重置筛选
          </button>
        </div>
      </div>
    </section>
  );
}
