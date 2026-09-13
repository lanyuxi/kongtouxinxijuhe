/**
 * 骨架屏：数据加载中的占位结构。
 *
 * 为什么值得做（第一性原理）：
 *   首屏要下载 3.8 MB 的 airdrops.json（188 个项目、含评分明细）。
 *   在此之前页面只有一行「正在加载空投数据…」，用户没有任何「大概要多久」的预期，
 *   会以为站点坏了 —— 这正是本项目的目标用户（新手）最容易直接关掉页面的时刻。
 *   骨架屏不加快加载，但它让「等待」变得可预期：结构已经就位，内容马上填充。
 *
 * 可访问性：
 *   整块 `aria-busy="true"` + `aria-live="polite"`，
 *   屏幕阅读器会朗读「正在加载项目列表」，而不是把一堆空 div 念一遍；
 *   视觉上的每个占位块都 aria-hidden，不参与朗读。
 *
 * 动效遵守 prefers-reduced-motion（在 index.css 里统一关闭动画）。
 */

/** 单张卡片骨架：尺寸与真实卡片一致，避免内容出现时发生布局跳动 */
function CardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-card p-4">
      <div className="flex items-center gap-3 pr-[4.75rem]">
        <span className="skeleton h-10 w-10 shrink-0 rounded-xl" aria-hidden />
        <span className="skeleton h-4 w-2/3 rounded-md" aria-hidden />
      </div>
      <span className="skeleton mt-3 h-3 w-1/3 rounded-md" aria-hidden />
      <span className="skeleton mt-2 h-3 w-full rounded-md" aria-hidden />
      <span className="skeleton mt-1.5 h-3 w-4/5 rounded-md" aria-hidden />
      <div className="mt-auto flex items-center gap-2 border-t border-line-soft pt-2.5">
        <span className="skeleton h-3 w-24 rounded-md" aria-hidden />
        <span className="skeleton h-3 w-14 rounded-md" aria-hidden />
        <span className="skeleton h-3 w-10 rounded-md" aria-hidden />
      </div>
    </div>
  );
}

export function CardSkeletonGrid({ rows = 1 }: { rows?: number }) {
  const count = 8 * rows;
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="正在加载项目列表"
    >
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
      <span className="sr-only">正在加载项目列表，请稍候</span>
    </div>
  );
}

/**
 * 详情页骨架：从列表点进详情时，详情数据与主数据集一起加载，
 * 用一块结构相近的占位替代「未找到该项目」的误导性提示。
 */
export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="正在加载项目详情">
      <span className="skeleton h-10 w-28 rounded-xl" aria-hidden />
      <div className="rounded-3xl border border-line bg-card p-8">
        <div className="flex items-center gap-5">
          <span className="skeleton h-20 w-20 rounded-3xl" aria-hidden />
          <div className="flex-1">
            <span className="skeleton h-6 w-1/2 rounded-md" aria-hidden />
            <span className="skeleton mt-3 h-4 w-1/3 rounded-md" aria-hidden />
          </div>
        </div>
        <span className="skeleton mt-6 h-4 w-full rounded-md" aria-hidden />
        <span className="skeleton mt-2 h-4 w-3/4 rounded-md" aria-hidden />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <span className="skeleton h-32 rounded-3xl" aria-hidden />
        <span className="skeleton h-32 rounded-3xl" aria-hidden />
        <span className="skeleton h-32 rounded-3xl" aria-hidden />
      </div>
      <span className="sr-only">正在加载项目详情，请稍候</span>
    </div>
  );
}
