import type { XResult } from '../lib/x-api-types';
import { selectProjectUpdates } from '../lib/x-api';
import { useState } from 'react';
export function XUpdates({ result, slug, onRefresh, refreshing = false }: { result: XResult; slug?: string; onRefresh?: () => void; refreshing?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const accounts = slug ? selectProjectUpdates(result, slug) : result.accounts;
  const posts = accounts.flatMap(account => account.posts.map(post => ({ account, post }))).sort((a, b) => (b.post.publishedAt ?? '').localeCompare(a.post.publishedAt ?? ''));
  const visible = expanded ? posts : posts.slice(0, slug ? 5 : 6);
  const task = result.task; const running = refreshing || task?.state === 'running';
  const format = (date: string) => new Date(date).toLocaleString('zh-CN');
  return <section className="card min-w-0" aria-label="个人 X 动态">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="panel-title">{slug ? '这个项目的 X 动态' : '我的 X 最新动态'}</h2><p className="mt-1 text-xs leading-relaxed text-ink-faint">使用你的 API 独立读取，仅你可见；这些动态是候选线索，公共项目库的更新时间独立记录。</p></div>
      {onRefresh && <button className="btn-ghost disabled:opacity-50" disabled={running} onClick={onRefresh}>{running ? '正在抓取…' : '更新我的 X 情报'}</button>}
    </div>
    <div className="mt-3 text-sm text-ink-soft" role="status" aria-live="polite">
      {running ? <p>正在检查官方账号 {task?.checked ?? 0} / {task?.total ?? 0}…</p> : task?.state === 'failed' ? <p className="text-warn">本轮抓取失败，保留上次成功数据。{task.failures[0]?.error.message}</p> : task?.state === 'partial' ? <p className="text-warn">本轮部分账号成功；未更新账号保留原检查时间。{task.failures[0]?.error.message}</p> : null}
      {result.lastSuccessAt && <p className="mt-1 text-xs">个人 X 上次成功读取：{format(result.lastSuccessAt)}</p>}
      {!running && task?.dataChanged === false && <p className="mt-1 text-xs">本轮内容未变化。</p>}
      {!running && accounts.length > 0 && posts.length === 0 && <p className="mt-2">已读取账号，暂无近期可读推文。</p>}
      {!running && posts.length > 0 && !posts.some(p => p.post.airdropSignal) && <p className="mt-2">本次动态未命中空投关键词，仍可核对原文。</p>}
      {!running && accounts.length === 0 && <p className="mt-2">{slug ? '本轮尚未读取到该项目的官方 X 动态。' : '尚无个人 X 动态，请在设置中配置并检测。'} <a href="#/settings" className="text-brand underline">前往设置</a></p>}
    </div>
    {visible.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {visible.map(({ account, post }) => <article key={`${account.handle}-${post.id}`} className="min-w-0 rounded-xl border border-line-soft bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium text-ink">@{account.handle}</span>{post.airdropSignal && <span className="rounded-full bg-brand-50 px-2 py-1 text-brand">空投候选线索</span>}{account.stale && <span className="text-warn">本轮未更新</span>}</div>
        <p className="mt-2 text-xs text-ink-faint">推文原文</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft [overflow-wrap:anywhere]">{post.text}</p>
        <p className="mt-3 text-xs text-ink-faint">{post.publishedAt ? `发布时间：${format(post.publishedAt)}` : '发布时间未提供'}<br />该账号检查：{format(account.checkedAt)}</p>
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-brand hover:underline">核对 X 原文 ↗</a>
        {!slug && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{account.slugs.map(s => <a key={s} href={`#/project/${s}`} className="text-xs text-brand hover:underline">查看项目 {s} →</a>)}</div>}
      </article>)}
    </div>}
    {posts.length > visible.length || expanded && posts.length > (slug ? 5 : 6) ? <button className="btn-ghost mt-4" onClick={() => setExpanded(v => !v)}>{expanded ? '收起动态' : `查看全部 ${posts.length} 条动态`}</button> : null}
  </section>;
}
