/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
        shell: '1240px',
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
