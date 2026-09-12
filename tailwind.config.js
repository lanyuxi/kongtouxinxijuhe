/** @type {import('tailwindcss').Config} */

/**
 * 字体字号整体上浮一档（第二轮：二级页面再放大）：
 * 原设计在 1920 宽屏下正文只有 14–16px、标题 20–24px，页面显得过小、
 * 文字难辨认（见 Issue #1 反馈）。此处直接放大语义化字号标尺，
 * 这样所有使用 text-xs/sm/base/lg/xl/2xl 的组件都会同步变大，
 * 无需逐个类名改写，保证全站（含二级详情页）缩放一致。
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        // 原 12px → 14px：次要说明文字（标签、时间、提示）
        xs: ['0.875rem', { lineHeight: '1.45rem' }],
        // 原 14px → 16px：正文与描述
        sm: ['1rem', { lineHeight: '1.7rem' }],
        // 原 16px → 19px：卡片主标题、要点正文
        base: ['1.1875rem', { lineHeight: '1.85rem' }],
        // 原 18px → 22px：小节标题
        lg: ['1.375rem', { lineHeight: '2rem' }],
        // 原 20px → 26px：区块标题
        xl: ['1.625rem', { lineHeight: '2.25rem' }],
        // 原 24px → 32px：列表页主标题
        '2xl': ['2rem', { lineHeight: '2.6rem' }],
        // 原 30px → 38px：大号评分数字
        '3xl': ['2.375rem', { lineHeight: '2.8rem' }],
        // 新增：二级页面项目名 / 页面主标题
        '4xl': ['2.75rem', { lineHeight: '3.2rem' }],
        // 新增：二级页面评分大数字
        '5xl': ['3.25rem', { lineHeight: '3.4rem' }],
      },
      colors: {
        page: '#F7F9FC',
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#172033',
          soft: '#667085',
          faint: '#98A2B3',
        },
        line: '#E6EAF0',
        brand: {
          DEFAULT: '#2563EB',
          light: '#3B82F6',
          wash: '#EFF6FF',
        },
        ok: { DEFAULT: '#16A34A', wash: '#F0FDF4' },
        warn: { DEFAULT: '#D97706', wash: '#FFFBEB' },
        danger: { DEFAULT: '#DC2626', wash: '#FEF2F2' },
      },
      maxWidth: {
        // 原 1240px → 1440px：宽屏下减少两侧空白，内容更饱满
        shell: '1440px',
        // 详情页正文列：原 max-w-3xl(768px) → 1024px（旧值，保留兼容）
        prose: '1024px',
        // 二级页面主列：右侧目录栏以外的正文宽度
        article: '1120px',
        // 二级页面右侧栏（试算 / 目录 / 官方资料）
        aside: '400px',
      },
      fontFamily: {
        sans: [
          '"Inter"',
          'system-ui',
          '-apple-system',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
