import { useState } from 'react';
import type { AirdropProject } from '../lib/types';

/**
 * 项目 Logo。
 *
 * 设计约束（来自本次需求）：
 *   1. 一律显示项目真实的官方图标，不允许出现缺省图或者「首字母色块」；
 *   2. 图标是仓库内的静态文件（public/logos/），不依赖任何外部图床。
 *
 * 「不留兜底」是刻意的：
 *   上一版在拿不到图时渲染首字母色块，结果是「图标抓不到」这件事被视觉掩盖，
 *   直到用户看到一整屏字母块才被发现。现在改为：
 *   · 数据侧 —— `npm run validate` 与 `tests/logos.test.ts` 强制校验 100% 覆盖率，
 *     漏抓图标直接让 CI 失败，问题在发布前就被拦住；
 *   · 渲染侧 —— 万一线上仍有单张图 404（例如 CDN 缓存未回源），
 *     只把图片隐藏、保留等宽的空位，不再伪造一个「看起来像 logo」的字母块。
 *   这样「图标缺失」是可见、可发现的，而不是被伪装成正常内容。
 */
const SIZES = {
  sm: 'h-10 w-10 rounded-xl',
  md: 'h-16 w-16 rounded-2xl',
  lg: 'h-20 w-20 rounded-3xl',
} as const;

export function ProjectLogo({
  project,
  size = 'md',
  className = '',
}: {
  project: AirdropProject;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box = `${SIZES[size]} shrink-0 overflow-hidden border border-line-soft bg-white ${className}`;

  if (!project.logo || failed) {
    /*
     * 不该发生：图标缺失时只保留一个空的占位方块（无字母、无默认图标）。
     * 视觉上明确「这里少了一张图」，同时不破坏卡片布局的宽高比。
     * aria-hidden + 空内容：屏幕阅读器读到的仍是项目名的链接文本，不会被干扰。
     */
    return <span aria-hidden className={`${box} block`} data-logo-missing={project.slug} />;
  }

  return (
    <span className={box}>
      <img
        src={project.logo}
        alt={`${project.name} Logo`}
        loading="lazy"
        decoding="async"
        width={size === 'sm' ? 40 : size === 'md' ? 64 : 80}
        height={size === 'sm' ? 40 : size === 'md' ? 64 : 80}
        className="h-full w-full object-contain p-1.5"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
