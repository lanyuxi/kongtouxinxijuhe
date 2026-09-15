/** @type {import('tailwindcss').Config} */

/**
 * 设计标尺（第三轮：视觉升级版）
 *
 * 目标：从「信息齐全的工具页」升级为「有设计感的产品页」。
 * 做法是建立一套可复用的设计令牌，而不是逐个页面堆样式：
 *  - 中性色改用带冷调的 slate 阶，替代原先的纯灰，整体更「高级」
 *  - 主色由单一蓝扩展为 50→700 完整色阶，支撑渐变与层次
 *  - 统一圆角 / 阴影 / 动效曲线三套令牌，保证全站观感一致
 *  - 字号标尺保持上一轮放大后的结果，仅补齐标题行高
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        xs: ['0.875rem', { lineHeight: '1.45rem' }],
        sm: ['1rem', { lineHeight: '1.7rem' }],
        base: ['1.1875rem', { lineHeight: '1.85rem' }],
        lg: ['1.375rem', { lineHeight: '2rem' }],
        xl: ['1.625rem', { lineHeight: '2.25rem' }],
        '2xl': ['2rem', { lineHeight: '2.6rem' }],
        '3xl': ['2.375rem', { lineHeight: '2.8rem' }],
        '4xl': ['2.75rem', { lineHeight: '3.2rem', letterSpacing: '-0.02em' }],
        '5xl': ['3.25rem', { lineHeight: '3.4rem', letterSpacing: '-0.03em' }],
        '6xl': ['4rem', { lineHeight: '4.1rem', letterSpacing: '-0.035em' }],
      },
      colors: {
        // 页面底：极浅冷灰，让白色卡片「浮」起来
        page: '#F4F6FC',
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#0B1220',
          soft: '#54607A',
          faint: '#8C97AC',
        },
        line: '#E2E7F2',
        line: {
          DEFAULT: '#E2E7F2',
          soft: '#EDF1F8',
        },
        brand: {
          50: '#EEF4FF',
          100: '#E0EAFF',
          200: '#C7D8FF',
          300: '#A4BFFF',
          400: '#6D93FF',
          500: '#3B6DF6',
          600: '#2563EB',
          700: '#1D4FD7',
          DEFAULT: '#2563EB',
          light: '#3B82F6',
          wash: '#EFF6FF',
          ink: '#14213D',
        },
        accent: {
          DEFAULT: '#7C5CFC',
          wash: '#F3F0FF',
          line: '#DED6FF',
        },
        ok: { DEFAULT: '#12A150', wash: '#ECFDF3', line: '#A6E7C0' },
        warn: { DEFAULT: '#C77700', wash: '#FFF8EB', line: '#FBD9A2' },
        danger: { DEFAULT: '#DC2626', wash: '#FEF2F2', line: '#F7C6C6' },
      },
      maxWidth: {
        shell: '1440px',
        wide: '1680px',
        prose: '1024px',
        article: '1120px',
        aside: '400px',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.15rem',
        '3xl': '1.6rem',
        // 设计稿专用：列表卡片外壳 12px、卡片内图标 12px
        card: '0.75rem',
        logo: '0.75rem',
      },
      boxShadow: {
        // 阴影分三层：越往下越「贴地」，避免廉价的大黑边。
        // 参考 galaxy 卡片：投影负责「浮起」，不负责「描边」——描边交给 border。
        card: '0 1px 2px rgba(11,18,32,0.04), 0 10px 28px -14px rgba(11,18,32,0.10)',
        'card-hover':
          '0 2px 6px rgba(11,18,32,0.05), 0 22px 48px -20px rgba(37,99,235,0.26)',
        // 悬停时卡片「抬起来」的那一层：位移 1px + 彩色投影，观感是物理抬起
        'card-float': '0 3px 8px rgba(11,18,32,0.05), 0 30px 60px -28px rgba(37,99,235,0.30)',
        lift: '0 24px 60px -28px rgba(11,18,32,0.35)',
        glow: '0 12px 32px -12px rgba(37,99,235,0.55)',
        // 主按钮的内高光：让渐变面看起来有厚度，而不是一张贴纸
        'btn-inner': 'inset 0 1px 0 rgba(255,255,255,0.28)',
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        // 数字一律走等宽表格数字，避免刷新时分位跳动引发误读
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // 数据过期时按钮轻微呼吸，提示「可以点我刷新」，但不刺眼
        'pulse-soft': {
          '0%, 100%': { boxShadow: '0 12px 32px -12px rgba(37,99,235,0.55)' },
          '50%': { boxShadow: '0 12px 40px -8px rgba(37,99,235,0.85)' },
        },
        // 骨架屏：横向微光扫过，表达「内容在路上」而非「这块坏了」。
        // 幅度刻意很小（背景位移），避免首屏出现大面积闪烁刺激眼睛。
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        // 详情页头部的记录线：左右来回，暗示「数据是活的」而不是一张静态海报
        sweep: {
          '0%': { transform: 'translateX(-60%)', opacity: '0' },
          '50%': { opacity: '0.9' },
          '100%': { transform: 'translateX(60%)', opacity: '0' },
        },
        // 骨架屏渐变描边环的旋转
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        sweep: 'sweep 6s cubic-bezier(0.4,0,0.2,1) infinite',
        'spin-slow': 'spin-slow 9s linear infinite',
      },
    },
  },
  plugins: [],
};
