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
        page: '#F5F7FB',
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#0F172A',
          soft: '#5A6478',
          faint: '#98A2B3',
        },
        line: '#E4E8F0',
        line: {
          DEFAULT: '#E4E8F0',
          soft: '#EEF1F6',
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
      },
      boxShadow: {
        // 三层阴影：越往下越「贴地」，避免廉价的大黑边
        card: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.10)',
        'card-hover': '0 2px 4px rgba(16,24,40,0.05), 0 18px 40px -16px rgba(37,99,235,0.22)',
        lift: '0 24px 60px -28px rgba(15,23,42,0.35)',
        glow: '0 12px 32px -12px rgba(37,99,235,0.55)',
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
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};
