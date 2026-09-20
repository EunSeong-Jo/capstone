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
        'surface-warm': '#F5F6F2',
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
        // Digital Atelier — 홈 화면 전용 토큰 (전역 토큰과 분리)
        atelier: {
          primary: {
            DEFAULT: '#5F7D81',
            light: '#EAF0F0',
            dark: '#47625F',
          },
          secondary: {
            DEFAULT: '#D1C7BD',
            light: '#F0EBE5',
          },
          neutral: '#F5F5F3',
          text: {
            DEFAULT: '#424242',
            sub: '#7A7A78',
          },
          gold: '#C8A96A',
          silver: '#A8AAAD',
          bronze: '#C08552',
          star: '#E0A94B',
          sale: '#C96A6A',
        },
        // 올리브영 클론 — 홈 전용 토큰 (무채색 + 레드 포인트)
        oy: {
          black: '#17171C', // 로고·활성칩·탭바 active·순위뱃지
          red: '#F8174A', // 할인율·세일·N/오특 뱃지·장바구니 카운트
          text: '#1A1A1A', // 기본 텍스트
          sub: '#9A9A9A', // 보조 텍스트
          line: '#EEEEEE', // 섹션 구분선·카드 보더
          chip: '#F4F4F4', // 태그칩 배경·비활성칩
        },
        // 온보딩·스플래시·로그인 전용 (전역 토큰과 분리)
        // 값 정의는 index.css의 --ob-* 한 곳. 여기서는 참조만 하므로 색 확정 시 이 블록은 건드리지 않습니다.
        ob: {
          green: {
            DEFAULT: 'rgb(var(--ob-green-rgb) / <alpha-value>)',
            deep: 'rgb(var(--ob-green-deep-rgb) / <alpha-value>)',
            soft: 'rgb(var(--ob-green-soft-rgb) / <alpha-value>)',
          },
          surface: 'rgb(var(--ob-surface-rgb) / <alpha-value>)',
          cream: 'rgb(var(--ob-cream-rgb) / <alpha-value>)',
          bg: 'rgb(var(--ob-bg-rgb) / <alpha-value>)',
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
        // Digital Atelier — 부드러운 확산광(Soft Diffuse Light)
        soft: '0 2px 8px rgba(95,125,129,.06), 0 8px 24px rgba(66,66,66,.04)',
        'soft-lg': '0 4px 16px rgba(95,125,129,.08), 0 16px 40px rgba(66,66,66,.06)',
      },
      backdropBlur: {
        glass: '12px',
      },
      keyframes: {
        slideDown: {
          '0%': { transform: 'translate(-50%, -100%)', opacity: '0' },
          '100%': { transform: 'translate(-50%, 0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translate(-50%, 100%)', opacity: '0' },
          '100%': { transform: 'translate(-50%, 0)', opacity: '1' },
        },
      },
      animation: {
        'slide-down': 'slideDown .28s ease-out',
        'slide-up': 'slideUp .28s ease-out',
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
        // Digital Atelier — 매거진 타이포 (한글은 Pretendard 폴백)
        headline: ['Plus Jakarta Sans', 'Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
