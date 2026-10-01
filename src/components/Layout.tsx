import type { ReactNode } from 'react';
import { BrandMark, BrandMarkSmall } from './BrandMark';

export type NavKey = 'latest' | 'hot' | 'potential' | 'claim' | 'watchlist' | 'safety' | 'settings';

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: 'latest', label: '最新空投', href: '#/latest' },
  { key: 'hot', label: '热门空投', href: '#/hot' },
  { key: 'potential', label: '潜在空投', href: '#/potential' },
  { key: 'claim', label: '可领取', href: '#/claim' },
  { key: 'watchlist', label: '我的关注', href: '#/watchlist' },
  { key: 'safety', label: '防骗自查', href: '#/safety' },
];

export function Logo() {
  return (
    <a href="#/latest" aria-label="空投情报平台首页" className="group flex shrink-0 items-center gap-3 no-underline">
      <BrandMark />
      <span className="hidden flex-col leading-none sm:flex">
        <span className="text-lg font-semibold tracking-tight text-ink">空投情报平台</span>
        <span className="mt-1 hidden text-xs font-normal tracking-wide text-ink-faint sm:block">
          看清每一个空投
        </span>
      </span>
    </a>
  );
}

export function Header({ current }: { current: NavKey }) {
  const main = NAV.filter((n) => n.key !== 'watchlist');
  const watch = NAV.find((n) => n.key === 'watchlist');
  const watchActive = current === 'watchlist';

  return (
    <header className="sticky top-0 z-30 border-b border-white/70 glass">
      <div className="shell flex h-[4.75rem] items-center gap-4">
        <Logo />
        {/* 主导航：6 项全部平铺时，窄屏会横向滚动且看不出「当前在哪」。
            改为「5 项主导航 + 1 项个人入口」，并用一条滑动色块表达选中态。 */}
        <nav
          aria-label="主导航"
          className="ml-auto hidden items-center gap-1 rounded-2xl border border-line-soft bg-white/80 p-1 shadow-sm lg:flex"
        >
          {main.map((n) => (
            <a
              key={n.key}
              href={n.href}
              aria-current={current === n.key ? 'page' : undefined}
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
        {watch && (
          <a
            href={watch.href}
            aria-current={watchActive ? 'page' : undefined}
            className={`ml-auto flex items-center gap-2 whitespace-nowrap rounded-2xl border px-3 py-2 text-sm no-underline transition-all duration-200 lg:ml-2 ${
              watchActive
                ? 'border-brand/40 bg-gradient-to-b from-brand-500 to-brand-600 font-medium text-white shadow-glow'
                : 'border-line-soft bg-white/80 text-ink-soft shadow-sm hover:border-brand/30 hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            <span aria-hidden>{watchActive ? '★' : '☆'}</span>
            {watch.label}
          </a>
        )}
        <a href="#/settings" aria-current={current === 'settings' ? 'page' : undefined} className={`flex shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm no-underline ${current === 'settings' ? 'border-brand/40 bg-brand-50 font-medium text-brand-700' : 'border-line-soft bg-white/80 text-ink-soft hover:bg-brand-50 hover:text-brand-700'}`}>
          <svg aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3h4v3l2 1 2.6-1.5 2 3.5-2.6 1.5v3l2.6 1.5-2 3.5L16 17l-2 1v3h-4v-3l-2-1-2.6 1.5-2-3.5L6 13.5v-3L3.4 9l2-3.5L8 7l2-1V3Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          设置
        </a>
      </div>
      {/* 窄屏：主导航下沉为五列标签，避免汉堡菜单带来的额外一次点击 */}
      <nav aria-label="主导航（窄屏）" className="lg:hidden">
        <div className="shell grid grid-cols-5 gap-1 pb-2.5">
          {main.map((n) => (
            <a
              key={n.key}
              href={n.href}
              aria-current={current === n.key ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full border px-1 py-3 text-center text-xs no-underline transition ${
                current === n.key
                  ? 'border-brand/40 bg-brand-50 font-medium text-brand-700'
                  : 'border-line-soft bg-white/70 text-ink-soft'
              }`}
            >
              {n.label}
            </a>
          ))}
        </div>
      </nav>
    </header>
  );
}

export function Footer({ updatedAt }: { updatedAt?: string }) {
  return (
    <footer className="mt-16 border-t border-line bg-white/70">
      <div className="shell grid gap-8 py-12 text-sm leading-relaxed text-ink-soft lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink">
            <BrandMarkSmall />
            空投情报平台
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
          {/* 视觉组件层来自 MIT 许可的开源项目，署名是许可证要求，也方便使用者追溯 */}
          <p className="text-xs text-ink-faint">
            视觉组件取自{' '}
            <a
              href="https://github.com/uiverse-io/galaxy"
              target="_blank"
              rel="noreferrer noopener"
              className="text-ink-soft underline-offset-2 hover:text-brand hover:underline"
            >
              uiverse-io/galaxy
            </a>
            （MIT）
          </p>
        </div>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="shell py-5 sm:py-8">{children}</div>;
}
