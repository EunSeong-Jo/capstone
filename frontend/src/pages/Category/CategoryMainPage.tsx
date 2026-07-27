import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/category/Icon';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import placeholderImage from '../../assets/placeholderImage';

const SIDEBAR_TABS = ['스킨케어', '마스크팩', '클렌징', '선케어', '메이크업', '바디케어', '헤어케어'];

interface CategoryGroup {
  id: string;
  name: string;
  subItems: string[];
}

// TODO: 실제 API 연동 전까지 목데이터, 카테고리 아이콘도 실제 이미지로 교체 필요
const CATEGORY_GROUPS: CategoryGroup[] = [
  { id: '스킨케어', name: '스킨케어', subItems: ['스킨/토너', '에센스/세럼/앰플', '크림', '로션', '미스트/오일', '스킨케어세트'] },
  { id: '마스크팩', name: '마스크팩', subItems: ['시트팩', '패드', '페이셜팩', '코팩', '패치'] },
  { id: '클렌징', name: '클랜징', subItems: ['클렌징폼/젤', '패드', '페이셜팩', '코팩', '패치'] },
  { id: '선케어', name: '선케어', subItems: ['선크림', '선스틱', '선쿠션', '선스프레이/선패치'] },
  { id: '메이크업', name: '메이크업', subItems: ['립메이크업', '베이스메이크업', '아이메이크업'] },
];

const NAV_HEIGHT = 52;

export default function CategoryMainPage() {
  const navigate = useNavigate();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeTab, setActiveTab] = useState(SIDEBAR_TABS[0]);
  const isClickScrolling = useRef(false);

  const goToList = () => navigate('/category/skincare');

  const scrollToTab = (tab: string) => {
    const el = sectionRefs.current[tab];
    if (!el) return;
    isClickScrolling.current = true;
    setActiveTab(tab);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => { isClickScrolling.current = false; }, 600);
  };

  // 스크롤 위치에 따라 왼쪽 탭이 자동으로 활성화되도록 추적
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) {
          const id = visible.target.getAttribute('data-group-id');
          if (id) setActiveTab(id);
        }
      },
      { rootMargin: `-${NAV_HEIGHT}px 0px -70% 0px`, threshold: 0 }
    );

    CATEGORY_GROUPS.forEach((group) => {
      const el = sectionRefs.current[group.id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-dvh bg-surface-warm">
      {/* 2b 헤더 — 타이틀(좌) + 검색·장바구니(우) */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between bg-surface-warm px-4"
        style={{ height: NAV_HEIGHT }}
      >
        <h1 className="text-[22px] font-extrabold text-gray-100 tracking-[-0.4px]">카테고리</h1>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/search')}
            aria-label="검색"
            className="active:scale-90 transition-transform"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#17171C" strokeWidth="1.8" />
              <path d="M16.5 16.5L21 21" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" aria-label="장바구니" className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M6 8h12l-.9 11.2a1.8 1.8 0 01-1.8 1.65H8.7a1.8 1.8 0 01-1.8-1.65L6 8z" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex items-start">
        {/* 좌측 사이드바 — 밀도 정리(46px) + 활성 그린 바 */}
        <aside
          className="sticky flex-shrink-0 w-[110px] flex flex-col overflow-y-auto bg-gray-10"
          style={{ top: NAV_HEIGHT, height: `calc(100dvh - ${NAV_HEIGHT}px)` }}
        >
          {SIDEBAR_TABS.map((tabLabel) => {
            const isActive = tabLabel === activeTab;
            return (
              <button
                key={tabLabel}
                type="button"
                onClick={() => scrollToTab(tabLabel)}
                className={`relative h-[46px] px-4 flex items-center text-[13px] text-left flex-shrink-0 ${
                  isActive ? 'bg-white text-primary-dark font-extrabold' : 'text-gray-50 font-medium'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-[3px] bg-primary" />
                )}
                {tabLabel}
              </button>
            );
          })}
          <div className="flex-1" />
        </aside>

        {/* 우측 그룹 목록 — 2단 그리드 서브카테고리 */}
        <div className="flex-1 flex flex-col gap-7 py-[18px] pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+24px)]">
          {CATEGORY_GROUPS.map((group) => (
            <section
              key={group.id}
              data-group-id={group.id}
              ref={(el) => { sectionRefs.current[group.id] = el; }}
              className="px-4"
            >
              <button type="button" onClick={goToList} className="flex items-center gap-2.5 w-full">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-gray-10 flex-shrink-0">
                  <img src={placeholderImage} alt="" className="w-full h-full object-cover" />
                </div>
                <span className="flex-1 text-[15px] font-extrabold text-gray-100 text-left">{group.name}</span>
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gray-50">
                  전체
                  <Icon name="arrow_forward_ios" size={13} />
                </span>
              </button>

              <div className="grid grid-cols-2 gap-x-3 mt-2">
                {group.subItems.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={goToList}
                    className="py-[11px] px-0.5 text-left text-[13px] text-gray-70 border-b border-gray-5"
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <OyBottomNav />
    </div>
  );
}
