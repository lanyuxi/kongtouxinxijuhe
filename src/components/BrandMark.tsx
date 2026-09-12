/**
 * 品牌标（BrandMark）——「水滴 + 定位/雷达」
 *
 * 设计意图：
 *  - 水滴是「空投（airdrop）」最直观的隐喻，同时读作定位针，指向「情报定位」；
 *  - 上方的同心弧是雷达信号，表达「持续扫描、实时情报」；
 *  - 线条只用单色（currentColor），保证在深色 / 浅色 / 单色场景都不失效；
 *  - 容器用品牌渐变托底，是全站里唯一的高饱和色块，起视觉锚点作用。
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-accent text-white shadow-glow ${className}`}
    >
      {/* 右上角柔光，避免纯渐变显得平板 */}
      <span className="pointer-events-none absolute -right-3 -top-3 h-8 w-8 rounded-full bg-white/25 blur-md" />
      <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="none" aria-hidden>
        {/* 雷达同心弧 */}
        <path
          d="M5.4 6.6a9.5 9.5 0 0 1 13.2 0"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M8 9.3a5.8 5.8 0 0 1 8 0"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.8"
        />
        {/* 水滴 / 定位针 */}
        <path
          d="M12 10.6c1.95 2.35 3.05 4.06 3.05 5.35a3.05 3.05 0 0 1-6.1 0c0-1.29 1.1-3 3.05-5.35Z"
          fill="currentColor"
        />
        <circle cx="12" cy="15.9" r="1.15" fill="#3B6DF6" />
      </svg>
    </span>
  );
}

/**
 * 页脚用的小号标：与 BrandMark 同构，仅尺寸与圆角更小。
 */
export function BrandMarkSmall() {
  return <BrandMark className="h-8 w-8 rounded-lg [&>svg]:h-5 [&>svg]:w-5" />;
}
