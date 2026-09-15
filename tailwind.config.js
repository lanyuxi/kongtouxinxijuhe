/** @type {import('tailwindcss').Config} */

/**
 * 设计标尺（第三轮：视觉升级版）
 *
 * 目标：从「信息齐全的工具页」升级为「有设计感的产品页」。
 * 做法是建立一套可复用的设计令牌，而不是逐个页面堆样式：
 *  - 中性色改用带冷调的 slate 阶，替代原先的纯灰，整体更「高级」
 *  - 主色由单一蓝扩展为 50→700 完整色阶，支撑渐变与层次
 *  - 统一圆角 / 阴影 / 动效曲线三套令牌，保证全站观感一致
 *  - 字号标尺在上一轮放大结果的基础上整体回落一档（见下方 fontSize 注释）
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
       * 字号标尺（第四轮：整体回落一档）
       * -----------------------------------------------------------------
       * 上一轮为了让信息「读得清」把每一档都放大了约 1/8，实测在 1440 视口下
       * 一级页面（列表）与二级页面（详情）都偏大：
       *   - 正文 19px 配上 1.85rem 行高，单屏能看到的卡片数量明显减少；
       *   - 详情页长文段落（教程 / 注意事项 / FAQ）一屏只有几行，滚动成本高；
       *   - 卡片内的小字（公链 / 风险 / 时间）与正文差距被压缩，层级反而变糊。
       * 因此这里统一把每一档下调约 1/8，回到「正文 17px / 行高 1.7」的阅读档位，
       * 并同步收紧行高（行高按同比例回落，否则文字变小而留白不变，观感会更松垮）。
       * 只动尺寸令牌，不动任何布局栅格与间距，避免牵动已对齐的卡片排布。
       */
      fontSize: {
        xs: ['0.78rem', { lineHeight: '1.3rem' }],
        sm: ['0.9rem', { lineHeight: '1.5rem' }],
        base: ['1.0625rem', { lineHeight: '1.7rem' }],
        lg: ['1.2rem', { lineHeight: '1.8rem' }],
        xl: ['1.4rem', { lineHeight: '2rem' }],
        '2xl': ['1.7rem', { lineHeight: '2.25rem' }],
        '3xl': ['2rem', { lineHeight: '2.45rem' }],
        '4xl': ['2.4rem', { lineHeight: '2.85rem', letterSpacing: '-0.02em' }],
        '5xl': ['2.85rem', { lineHeight: '3.1rem', letterSpacing: '-0.03em' }],
        '6xl': ['3.5rem', { lineHeight: '3.7rem', letterSpacing: '-0.035em' }],
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
