import { useEffect, useState } from 'react';
import type { LiveIndex, SourceHealthFile, Publication } from '../lib/types';
import { STALE_MINUTES, isStale, loadPublication } from '../lib/refresh';
import { relativeTime } from '../lib/labels';
import { computeCoverageGap } from '../lib/coverage';
import { refreshCapability, refreshEndpoint } from '../lib/refresh';

/**
 * 公共数据源检查信息。
 *
 * 需要向用户说清三件事（缺一就会让人以为按钮坏了）：
 *   1. 数据现在有多新（相对时间 + 是否过期）
 *   2. 数据从哪些来源来的、各多少条
 *   3. 当前部署能否触发新的抓取
 */
export function RefreshBar({
  index,
  changeDetails,
  health,
  totalProjects,
}: {
  index: LiveIndex | null;
  /** 最近一次抓取的项目级变更明细，例如「Monad 状态：潜在空投 → 开放领取」 */
  changeDetails?: string[];
  /** 数据源健康状态；用于把「库内 vs 本轮」的差异摊开（P2-2） */
  health?: SourceHealthFile | null;
  /** 库内项目总数 */
  totalProjects?: number;
}) {
  // 让相对时间自己走起来，否则页面停留久了会显示过期信息
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const [publication, setPublication] = useState<Publication | null>(null);
  useEffect(() => {
    let active = true;
    loadPublication().then(p => { if (active) setPublication(p); });
    return () => { active = false; };
  }, [index?.updated_at]);

  const stale = isStale(index);
  const healthy = index?.sources ?? [];

  /**
   * 库内数据 vs 本轮来源的覆盖率差异（P2-2）。
   *
   * 为什么必须显式展示：工具条原本只说「2/2 来源正常」，
   * 用户合理地以为「库里的每一条都是刚抓到的」。
   * 实测库内 202 条、本轮来源 178 条 —— 多出来的 24 条是历史留存
   * （Last Known Good 机制要求保留，否则来源抖动会清空全库）。
   * 这层差异不解释，就会变成「来源正常但数据对不上」的困惑。
   */
  /**
   * 「一键更新」在当前部署下的真实能力（P2-3）。
   * 未接入触发器时明确写出「不会触发新的抓取」——
   * 原来按钮写着「一键更新」、点完说「已更新到最新数据」，
   * 用户会以为平台刚刚抓取了最新情报，而实际只是重新拉了一次静态 JSON。
   */
  const capability = refreshCapability(refreshEndpoint());

  /**
   * X（Twitter）来源的专门说明（issue #28）。
   *
   * 为什么单独处理而不是混在「来源失败」里：
   *   X 抓不到不是「抖动」，而是**能力门槛**：需要 X_BEARER_TOKEN 才能抓推文。
   *   把它和普通失败一起显示成红字「数据源异常」，用户会以为系统坏了
   *   （这正是 Galxe 当时被下线的原因）。这里改成中性措辞 + 给出解法，
   *   用户知道「加一个 Token 就能开」，而不是「这站坏了」。
   */
  const xSource = health?.sources.find((s) => /^X\s*\(Twitter\)/.test(s.name));
  const xUnavailable = xSource?.status === 'not_configured';

  const coverage =
    totalProjects === undefined
      ? null
      : computeCoverageGap({
          totalProjects,
          currentRoundItems: healthy.reduce((s, x) => s + x.count, 0),
          sources: health?.sources.filter(s => s.status !== 'not_configured').length ?? healthy.length,
          okSources: health
            ? health.sources.filter((x) => x.ok).length
            : healthy.length,
        });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="panel-title !text-base">公共空投数据源</h2>

          <span
            className={`chip ${
              stale ? 'border-warn/40 bg-warn-wash text-warn' : 'border-ok/40 bg-ok-wash text-ok'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-warn' : 'bg-ok'}`}
              aria-hidden
            />
            {index?.updated_at ? `${relativeTime(index.updated_at)}检查` : '暂无数据'}
          </span>
          {stale && (
            <span className="text-xs text-warn">
              已超过 {STALE_MINUTES / 60} 小时未成功检查，请查看运行记录
            </span>
          )}
        </div>

        {/* 能力说明：必须紧跟标题出现，而不是只在点击后才解释。
            用户点之前就该知道「这次点击能不能拿到新数据」。 */}
        <p className="mt-2 text-xs text-ink-faint">{capability.note}</p>

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

        {publication && <div className="mt-3 space-y-1 text-xs text-ink-soft">
          <p>最近成功检查：{publication.last_successful_check_at ? relativeTime(publication.last_successful_check_at) : '未记录'}（成功来源已检查，不代表全部来源正常）</p>
          <p>内容最近变化：{publication.content_updated_at ? relativeTime(publication.content_updated_at) : '未记录'}；内容不变也会刷新检查时间。</p>
          <p>发布版本构建时间：{new Date(publication.prepared_at).toLocaleString('zh-CN')}（不是实际发布时间）</p>
          <p>实际发布时间：{publication.run_url ? <a href={publication.run_url} target="_blank" rel="noreferrer noopener" className="text-brand">查看此版本的部署记录 ↗</a> : '本地构建，尚无线上部署记录'}</p>
        </div>}
        {xUnavailable && (
          <p className="mt-2 text-xs text-ink-faint">ℹ 公共 X 来源尚未接入访问凭据。你的个人 X 配置和结果独立显示，<a href="#/settings" className="text-brand underline">前往设置</a>。</p>
        )}

        {/* 库内 vs 本轮覆盖率（P2-2）：把差异显式摊开，而不是只说「来源正常」。
            「正常」只说明抓取动作成功，不说明库内每条都是本轮抓到的。 */}
        {coverage && coverage.level !== 'aligned' && (
          <p
            className={`mt-2 text-xs ${
              coverage.level === 'warning' || coverage.level === 'source_error'
                ? 'text-warn'
                : 'text-ink-faint'
            }`}
          >
            {coverage.level === 'source_error' ? '⚠ ' : coverage.level === 'warning' ? '⚠ ' : 'ℹ '}
            {coverage.message}
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

    </section>
  );
}
