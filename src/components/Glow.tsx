import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * 指针光源容器（Galaxy Spotlight 模式）
 * ---------------------------------------------------------------------------
 * 桌面端：鼠标在卡片上移动时，卡片内部跟随一道极淡的径向光。
 * 为什么值得做：一屏 8–12 张卡片时，「鼠标下的这张」最难识别 ——
 * 描边与投影在 300px 宽的卡片上不够显眼，而光斑是跟着指针走的，指向明确。
 *
 * 三条自我约束（否则就会变成廉价的炫技）：
 *   1. 不改变布局与尺寸，只叠一层不可交互的伪元素；
 *   2. 触屏与「减少动态效果」偏好下完全不触发（见 index.css）；
 *   3. 光斑透明度只有 0.13，扫过时不会盖住任何文字。
 */
export function SpotlightHost({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);

  return (
    <div ref={ref} onMouseMove={onMove} className={`pointer-host relative ${className}`}>
      <span aria-hidden className="pointer-glow" />
      {children}
    </div>
  );
}
