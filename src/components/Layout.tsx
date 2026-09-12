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
    <a href="#/latest" className="flex items-center gap-2 no-underline">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-base font-bold text-white">
        DL
      </span>
      <span className="text-lg font-semibold text-ink">
        DropLens
        <span className="ml-2.5 hidden text-sm font-normal text-ink-soft sm:inline">
          看清每一个空投
        </span>
      </span>
    </a>
  );
}

export function Header({ current }: { current: NavKey }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="shell flex h-[4.5rem] items-center gap-5">
        <Logo />
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <a
              key={n.key}
              href={n.href}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm no-underline transition-colors ${
                current === n.key
                  ? 'bg-brand-wash font-medium text-brand'
                  : 'text-ink-soft hover:bg-brand-wash hover:text-brand'
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
    <footer className="mt-12 border-t border-line bg-white">
      <div className="shell py-10 text-sm leading-relaxed text-ink-soft">
        <p className="font-medium text-ink">DropLens · 空投雷达与决策助手</p>
        <p className="mt-2 max-w-2xl">
          本站仅聚合公开信息并提供证据置信度、风险等级与参与价值参考，
          <strong className="text-ink">不构成投资建议</strong>，不保证空投真实性与收益。
          请始终使用独立空投钱包，任何页面都不会要求你输入助记词或私钥。
        </p>
        <p className="mt-2">
          数据自动更新 · 用户收藏与进度仅保存在你的浏览器本地
          {updatedAt && <span> · 最后更新 {new Date(updatedAt).toLocaleString('zh-CN')}</span>}
        </p>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="shell py-8 sm:py-10">{children}</div>;
}
