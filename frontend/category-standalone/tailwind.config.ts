import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3D8F6F',
          light: '#EAF5EF',
          dark: '#2B6B52',
        },
        accent: {
          DEFAULT: '#FF5C7A',
          light: '#FFF0F3',
        },
        warning: '#FF9500',
        star: '#FFB800',
        badge: '#FF3B30',
        surface: '#F7F8FA',
        border: '#E8EAED',
        gray: {
          0: '#FFFFFF',
          5: '#F7F8FA',
          10: '#F2F3F5',
          20: '#E8EAED',
          50: '#9CA3AF',
          70: '#6B7280',
          100: '#111827',
        },
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        full: '9999px',
      },
      fontSize: {
        xs: ['11px', '1.4'],
        sm: ['12px', '1.4'],
        base: ['14px', '1.5'],
        md: ['15px', '1.5'],
        lg: ['16px', '1.5'],
        xl: ['18px', '1.4'],
        '2xl': ['20px', '1.3'],
        '3xl': ['24px', '1.2'],
        '4xl': ['28px', '1.2'],
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
      },
      boxShadow: {
        sm: '0 1px 4px rgba(0,0,0,.06)',
        md: '0 2px 12px rgba(0,0,0,.10)',
        lg: '0 4px 24px rgba(0,0,0,.14)',
      },
      fontFamily: {
        sans: [
          'Pretendard',
          'Noto Sans KR',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config
