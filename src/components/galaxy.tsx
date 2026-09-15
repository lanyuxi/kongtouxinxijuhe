import type { ReactNode } from 'react';

/**
 * Galaxy 组件层（本地适配版）
 * ------------------------------------------------------------------
 * 来源：GitHub `uiverse-io/galaxy`（MIT，12856 stars，12 大类约 3800 个社区组件）。
 * 它是 CSS / Tailwind 片段库，不是 npm 包，因此不存在 `npm i galaxy` 这种用法。
 * 本文件是**按第三方库的用法的本地适配**：
 *   - 从 galaxy 里挑选与本站信息密度匹配的组件模式（卡片 / 指标 / 徽章 / 骨架 / 按钮）；
 *   - 统一收敛到本项目的设计令牌（tailwind.config.js + src/styles/index.css）；
 *   - 只保留 CSS 与结构，不引入任何运行时依赖，保持「零服务端、纯静态」。
 *
 * 为什么需要这层适配（第一性原理）：
 *   站点此前的问题不是「缺功能」，而是**所有信息的重要性看起来完全一样**——
 *   每张卡片都一样重、每个数字都一样大、每个区块都用同一个 panel。
 *   用户（空投新手）要的是「我下一步该看哪个」，所以视觉必须重新分层：
 *   层级来自「尺寸 / 对比 / 位置 / 动效」四个维度，而不是再堆一种颜色。
 *   这层组件把这四个维度固化下来，避免每个页面各写一套。
 *
 * 抽自 galaxy 的具体组件（均改写，非复制粘贴）：
 *   - Buttons/Creatlydev_pretty-grasshopper-57   彩色层推入 + 图标块（→ 主按钮的悬停反馈）
 *   - Buttons/Cornerstone-04_bitter-impala-54    边角描边沿边线扫过（→ 次级按钮）
 *   - Buttons/A3zra_empty-lionfish-28            按下时的整体回弹（→ .btn:active）
 *   - Cards/Admin12121_average-parrot-89         侧边光条 + 点阵底纹（→ 卡片悬停）
 *   - Cards/uctteam_rare-skunk-4                 悬停位移 + 彩色投影（→ .lift-card）
 *   - Pattern 类                                  径向光源跟随指针（→ PointerGlow）
 *   - loaders 类                                  渐变描边环（→ 加载骨架）
 */

/** Galaxy 来源与授权（用于页面或文档中标注出处） */
export const GALAXY = {
  repo: 'https://github.com/uiverse-io/galaxy',
  site: 'https://uiverse.io',
  license: 'MIT',
  componentCount: 3800,
} as const;

/**
 * 骨架基元。
 * Galaxy 的加载态组件都用「描边 + 微光」而不是纯色块，
 * 因为纯灰块在浅色页面上会被读成「这里坏了」，描边则读成「正在填」。
 */
export function Shimmer({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden />;
}

/**
 * 指标磁贴：数字（等宽）+ 标签 + 说明。
 * 直接把「最大值 / 目标值」画成一条细轨，让用户在读到数字的同时看到它离上限多远——
 * 这是本站「可解释评分」的最小视觉单元。
 *
 * `as="button"`：磁贴同时是「统计结果」和「筛选项」。
 * 用语义化 <button> 而不是给 div 绑 onClick ——
 *   键盘可 Tab 聚焦、Enter/Space 可触发，读屏会朗读 aria-pressed 的开合状态；
 *   用 div 则这一整条入口对键盘与读屏用户完全不存在。
 */
export function MetricTile({
  label,
  value,
  max,
  hint,
  tone = 'brand',
  as = 'div',
  className = '',
  onClick,
  ...rest
}: {
  label: string;
  value: ReactNode;
  max?: number;
  hint?: ReactNode;
  tone?: 'brand' | 'ok' | 'warn' | 'danger' | 'ink';
  as?: 'div' | 'button';
  className?: string;
  onClick?: () => void;
  'aria-pressed'?: boolean;
  title?: string;
}) {
  const Tag = as;
  const interactive = as === 'button';
  return (
    <Tag
      {...(interactive ? { type: 'button' as const, onClick } : {})}
      {...rest}
      className={`stat-tile stat-tile--${tone} ${interactive ? 'stat-tile--interactive' : ''} ${className}`}
    >
      <p className="stat-tile__label">{label}</p>
      <p className="stat-tile__value">
        {value}
        {max !== undefined && <span className="stat-tile__unit">/ {max}</span>}
      </p>
      {hint && <p className="stat-tile__hint">{hint}</p>}
      {interactive && (
        /* 选中态不能只靠颜色：加一个明确的「筛选中」标记，
           色觉障碍用户与读屏用户同样能确认当前口径。 */
        <span className="stat-tile__flag" aria-hidden>
          ⏷
        </span>
      )}
    </Tag>
  );
}

/**
 * 指针光源容器：跟随鼠标的径向高光。
 * 取自 galaxy 的 Spotlight 卡片模式，改成「没有鼠标就没有效果」——
 * 触屏与键盘用户不会因为缺少这个效果而丢信息，它纯粹是桌面端的精致度加成。
 */
export function PointerGlow({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`pointer-events-none pointer-glow ${className}`} />;
}

/** 区块标题：左侧色条 + 可选尾部说明，统一详情页与列表页的层级语言 */
export function SectionTitle({
  children,
  aside,
  id,
}: {
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="panel-title" id={id}>
        {children}
      </h2>
      {aside}
    </div>
  );
}
