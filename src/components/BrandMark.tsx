/**
 * 品牌标（BrandMark）
 *
 * 设计取舍（2026-09-16 改版）：
 *   - 图形不再由前端手写成 SVG，而是直接使用站点自己的位图品牌标
 *     （`public/brand-logo.png`）。它由站点方提供，是全站唯一的品牌图形来源，
 *     避免「一处改了、另一处还是旧图」这种最常见的破损形态。
 *   - 只用站点自有图形，**不复用任何项目方的 Logo**（那些是各项目方的商标），
 *     以免产生「本站与某项目有关联」的误导。
 *   - 图形自带宽幅留白，因此容器不再叠加渐变底色与圆角托底：
 *     叠加后会出现「方底色块套图形」的双层边框，在小尺寸下尤其脏。
 *   - 固定 1:1 与 `object-contain`：源图是正方形，任何容器比例下都不应被拉伸。
 *   - 尺寸交给调用方（h/w 类），组件本身只负责比例与对齐。
 */
export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`relative grid h-11 w-11 shrink-0 place-items-center ${className}`}>
      <img
        src={`${import.meta.env.BASE_URL}brand-logo.png`}
        alt=""
        aria-hidden
        width={44}
        height={44}
        // 品牌标是首屏可见元素，不做懒加载，避免左上角出现一次空位闪动
        decoding="async"
        draggable={false}
        className="h-full w-full select-none object-contain"
      />
    </span>
  );
}

/**
 * 页脚用的小号标：与 BrandMark 同构，仅尺寸更小。
 */
export function BrandMarkSmall() {
  return <BrandMark className="h-8 w-8" />;
}
