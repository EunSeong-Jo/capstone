import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopNavBar } from '../../components/category/TopNavBar';
import { Icon } from '../../components/category/Icon';
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

const NAV_HEIGHT = 48;

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
    <div className="min-h-dvh bg-white">
      <TopNavBar title="카테고리" />

      <div className="flex items-start">
        <aside
          className="sticky flex-shrink-0 w-[126px] flex flex-col overflow-y-auto"
          style={{ top: NAV_HEIGHT, height: `calc(100dvh - ${NAV_HEIGHT}px)` }}
        >
          {SIDEBAR_TABS.map((tabLabel) => {
            const isActive = tabLabel === activeTab;
            return (
              <button
                key={tabLabel}
                type="button"
                onClick={() => scrollToTab(tabLabel)}
                className={`h-[47px] px-6 flex items-center text-sm text-left flex-shrink-0 ${
                  isActive ? 'bg-white text-gray-100 font-medium' : 'bg-gray-10 text-gray-50'
                }`}
              >
                {tabLabel}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 flex flex-col gap-9 py-4">
          {CATEGORY_GROUPS.map((group) => (
            <section
              key={group.id}
              data-group-id={group.id}
              ref={(el) => { sectionRefs.current[group.id] = el; }}
              className="px-4"
            >
              <button type="button" onClick={goToList} className="flex items-center">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-10 flex-shrink-0">
                  <img src={placeholderImage} alt="" className="w-full h-full object-cover" />
                </div>
                <span className="ml-3.5 text-base font-medium text-gray-100">{group.name}</span>
                <Icon name="arrow_forward_ios" size={24} className="text-gray-20" />
              </button>

              <div className="flex flex-col gap-[26px] mt-[26px]">
                {group.subItems.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={goToList}
                    className="text-sm text-gray-100 text-left"
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
