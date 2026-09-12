import type { ReactNode } from 'react';

export type NavKey = 'latest' | 'hot' | 'potential' | 'claim' | 'watchlist';

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: 'latest', label: '最新空投', href: '#/latest' },
  { key: 'hot', label: '热门空投', href: '#/hot' },
  { key: 'potential', label: '潜在空投', href: '#/potential' },
  { key: 'claim', label: '可领取', href: '#/claim' },
  { key: 'watchlist', label: '我的关注', href: '#/watchlist' },
];

export function Logo() {
  return (
    <a href="#/latest" className="group flex items-center gap-3 no-underline">
      <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-400 via-brand-600 to-accent text-base font-bold tracking-tight text-white shadow-glow">
        DL
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-lg font-semibold tracking-tight text-ink">DropLens</span>
        <span className="mt-1 hidden text-xs font-normal tracking-wide text-ink-faint sm:block">
          看清每一个空投
        </span>
      </span>
    </a>
  );
}

export function Header({ current }: { current: NavKey }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 glass">
      <div className="shell flex h-[4.75rem] items-center gap-5">
        <Logo />
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto rounded-2xl border border-line-soft bg-white/70 p-1 shadow-sm">
          {NAV.map((n) => (
            <a
              key={n.key}
              href={n.href}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm no-underline transition-all duration-200 ${
                current === n.key
                  ? 'bg-gradient-to-b from-brand-500 to-brand-600 font-medium text-white shadow-glow'
                  : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700'
              }`}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function Footer({ updatedAt }: { updatedAt?: string }) {
  return (
    <footer className="mt-16 border-t border-line bg-white/70">
      <div className="shell grid gap-8 py-12 text-sm leading-relaxed text-ink-soft lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
              DL
            </span>
            DropLens · 空投雷达与决策助手
          </p>
          <p className="mt-4 max-w-3xl">
            本站仅聚合公开信息并提供证据置信度、风险等级与参与价值参考，
            <strong className="text-ink">不构成投资建议</strong>，不保证空投真实性与收益。
            请始终使用独立空投钱包，任何页面都不会要求你输入助记词或私钥。
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:items-end lg:text-right">
          <span className="eyebrow">数据说明</span>
          <p>数据自动更新 · 用户收藏与进度仅保存在浏览器本地</p>
          {updatedAt && (
            <p className="text-ink-faint">最后更新 {new Date(updatedAt).toLocaleString('zh-CN')}</p>
          )}
        </div>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="shell py-8 sm:py-10">{children}</div>;
}
