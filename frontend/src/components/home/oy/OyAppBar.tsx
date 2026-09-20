import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OY_VERTICALS } from '../../../mocks/oliveyoung';
import { useCart } from '../../../context/cart';

interface OyAppBarProps {
  /** 미지정 시 장바구니 컨텍스트의 담긴 수량을 쓴다 */
  cartCount?: number;
  /** 현재 선택된 도메인 id (기본 화장품) */
  vertical?: string;
  /** 도메인 변경 콜백 */
  onChangeVertical?: (id: string) => void;
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 올리브영식 상단 앱바 — 로고(swappy) + 도메인 전환 시트(상단에서 내려옴) */
export function OyAppBar({ cartCount, vertical = 'cosmetics', onChangeVertical }: OyAppBarProps) {
  const navigate = useNavigate();
  const { count: cartCtxCount } = useCart();
  const badge = cartCount ?? cartCtxCount;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(vertical);

  const select = (id: string) => {
    setSelected(id);
    setOpen(false);
    onChangeVertical?.(id);
  };

  // 상단 2개 카드 + 나머지 리스트 행
  const cards = OY_VERTICALS.slice(0, 2);
  const rows = OY_VERTICALS.slice(2);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-[52px] px-4 bg-surface-warm">
        {/* 로고(7c ≈ 마크) + 워드마크 + 화살표 버튼 */}
        <div className="flex items-center gap-1.5">
          <svg viewBox="-120 -120 240 240" className="h-[22px] w-[22px] shrink-0" aria-hidden>
            <path d="M-84,-34 C-56,-76 -28,8 0,-34 C28,-76 56,8 84,-34" fill="none" stroke="#2B6B52" strokeWidth="32" strokeLinecap="round" />
            <path d="M-84,40 C-56,-2 -28,82 0,40 C28,-2 56,82 84,40" fill="none" stroke="#9DCDB8" strokeWidth="32" strokeLinecap="round" />
          </svg>
          <h1 className="text-[22px] font-black italic tracking-tight text-oy-black">swappy</h1>
          <button
            onClick={() => setOpen(true)}
            aria-label="카테고리 전환"
            aria-expanded={open}
            className="flex items-center justify-center w-5 h-5 rounded-[5px] active:scale-90 transition-transform"
            style={{ backgroundColor: '#17171C' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* 우측 아이콘 */}
        <div className="flex items-center gap-4">
          <button aria-label="알림" className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button aria-label="검색" onClick={() => navigate('/search')} className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#17171C" strokeWidth="1.8" />
              <path d="M16.5 16.5L21 21" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button
            aria-label="장바구니"
            onClick={() => navigate('/cart')}
            className="relative active:scale-90 transition-transform"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M6 8h12l-.9 11.2a1.8 1.8 0 01-1.8 1.65H8.7a1.8 1.8 0 01-1.8-1.65L6 8z" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {badge > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold leading-none flex items-center justify-center"
                style={{ backgroundColor: '#F8174A' }}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 도메인 전환 시트 (상단에서 내려옴) */}
      {open && (
        <>
          {/* 페이지 딤 backdrop */}
          <button
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/35 cursor-default"
          />
          {/* 시트 본문 */}
          <div
            className="fixed top-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 rounded-b-3xl
                       bg-gradient-to-b from-primary/95 via-primary/55 to-primary-light/75
                       backdrop-blur-xl shadow-xl animate-slide-down"
            style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
          >
            <div className="px-3 pb-3">
              {/* 상단 2개 카드 */}
              <div className="grid grid-cols-2 gap-3">
                {cards.map((v, i) => {
                  const on = v.id === selected;
                  const primaryCard = i === 0;
                  return (
                    <button
                      key={v.id}
                      onClick={() => select(v.id)}
                      className={`relative h-32 rounded-2xl p-4 flex flex-col justify-between text-left active:scale-[.98] transition-transform ${
                        primaryCard ? 'bg-primary text-white' : 'bg-primary-light text-oy-text'
                      }`}
                    >
                      <span className="text-3xl">{v.icon}</span>
                      <span className="text-lg font-extrabold italic leading-tight">{v.label}</span>
                      {on && (
                        <span className="absolute top-3 right-3">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.35)" />
                            <path d="M7 12.5l3.2 3.2L17 8" stroke={primaryCard ? '#fff' : '#3D8F6F'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 나머지 리스트 행 */}
              <div className="flex flex-col gap-2 mt-3">
                {rows.map((v) => {
                  const on = v.id === selected;
                  return (
                    <button
                      key={v.id}
                      onClick={() => select(v.id)}
                      className="flex items-center gap-3 w-full rounded-2xl bg-white/45 backdrop-blur px-4 py-3.5 text-left active:scale-[.99] transition-transform"
                    >
                      <span className="text-xl">{v.icon}</span>
                      <span className="flex-1 text-base font-extrabold text-oy-text">{v.label}</span>
                      {on && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mr-1">
                          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3D8F6F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      <Chevron />
                    </button>
                  );
                })}
              </div>

              {/* 닫기 */}
              <div className="flex justify-end pt-3 pb-1 pr-1">
                <button
                  onClick={() => setOpen(false)}
                  className="text-[15px] font-bold text-oy-text underline underline-offset-4"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
