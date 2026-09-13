import { useEffect, useState } from 'react';
import type { LiveIndex } from '../lib/types';
import { STALE_MINUTES, isStale } from '../lib/refresh';
import { relativeTime } from '../lib/labels';

/**
 * 「一键更新」工具条。
 *
 * 需要向用户说清三件事（缺一就会让人以为按钮坏了）：
 *   1. 数据现在有多新（相对时间 + 是否过期）
 *   2. 数据从哪些来源来的、各多少条
 *   3. 点击后正在发生什么（实时进度文案）
 */
export function RefreshBar({
  index,
  onRefresh,
  refreshing,
  message,
  changeDetails,
}: {
  index: LiveIndex | null;
  onRefresh: () => void;
  refreshing: boolean;
  message: string | null;
  /** 最近一次抓取的项目级变更明细，例如「Monad 状态：潜在空投 → 开放领取」 */
  changeDetails?: string[];
}) {
  // 让相对时间自己走起来，否则页面停留久了会显示过期信息
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const stale = isStale(index);
  const healthy = index?.sources ?? [];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight text-ink">空投数据源</h2>
          <span
            className={`chip ${
              stale ? 'border-warn/40 bg-warn-wash text-warn' : 'border-ok/40 bg-ok-wash text-ok'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-warn' : 'bg-ok'}`}
              aria-hidden
            />
            {index?.updated_at ? `${relativeTime(index.updated_at)}更新` : '暂无数据'}
          </span>
          {stale && (
            <span className="text-xs text-warn">
              已超过 {STALE_MINUTES} 分钟未更新，建议手动刷新
            </span>
          )}
        </div>

        <p className="mt-2 truncate text-sm text-ink-soft">
          {healthy.length > 0 ? (
            <>
              共{' '}
              <strong className="metric text-ink">
                {healthy.reduce((s, x) => s + x.count, 0)}
              </strong>{' '}
              条来源线索，来自{' '}
              {healthy.map((s) => `${s.source}（${s.count}）`).join('、')}
            </>
          ) : (
            '正在读取数据源信息…'
          )}
        </p>

        {/* aria-live 让「更新中 → 已更新」的异步结果被读屏播报，
            否则读屏用户点完按钮没有任何反馈，只能怀疑自己点错了 */}
        {message && (
          <p
            id="refresh-status-text"
            className="mt-2 text-sm font-medium text-brand"
            role="status"
            aria-live="polite"
          >
            {refreshing ? '⏳ ' : '✓ '}
            {message}
          </p>
        )}

        {/* 项目级变更明细：只给「变更 12」这种计数，用户无法判断哪个项目变了、变成了什么。
            这里逐条列出具体变化，回访用户一眼就能看到有没有动静。 */}
        {changeDetails && changeDetails.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
            {changeDetails.map((d) => (
              <li key={d} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-busy={refreshing}
        aria-describedby="refresh-status-text"
        className={`btn-primary shrink-0 !px-6 !py-3 disabled:cursor-not-allowed disabled:opacity-60 ${
          stale ? 'animate-pulse-soft' : ''
        }`}
      >
        {refreshing ? (
          <>
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
            更新中…
          </>
        ) : (
          <>⟳ 一键更新</>
        )}
      </button>
    </section>
  );
}
