import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/category/Icon';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { CATEGORIES, CategoryDef } from '../../data/categories';
import { useProducts } from '../../hooks/useProducts';
import { CartIcon } from '../../components/ui/OutlineIcons';

/**
 * 카테고리 메인 — DB에 실제로 있는 4종만.
 *
 * 예전에는 메이크업·바디케어·헤어케어를 포함한 7개 그룹과 그 아래
 * 소분류를 그렸는데, 전부 하드코딩이었고 수집기가 얼굴용 4종만 적재하므로
 * (`scripts/load_products.py`의 ALLOWED_CATEGORIES) 눌러도 빈 목록이었다.
 * 아이콘도 전부 같은 /placeholder.png였다.
 *
 * 지금은 카테고리마다 실제 제품 수와 대표 이미지를 API에서 가져온다.
 */

const NAV_HEIGHT = 52;

/**
 * 카테고리 한 칸. 훅을 쓰기 위해 컴포넌트로 뗐다 — 반복문 안에서
 * useProducts를 부를 수는 없다.
 */
function CategoryRow({ category }: { category: CategoryDef }) {
  const navigate = useNavigate();
  // size=1이면 total과 대표 이미지 하나만 받아온다. 목록은 상세 화면에서.
  const { products, total, loading } = useProducts({
    category: category.label,
    sort: 'popular',
    size: 1,
  });
  const cover = products[0];

  return (
    <button
      type="button"
      onClick={() => navigate(`/category/${category.slug}`)}
      className="flex w-full items-center gap-3 rounded-2xl border border-gray-10 bg-white p-3 text-left active:scale-[.99] transition-transform"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-10">
        {cover?.imageUrl && (
          <img src={cover.imageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold text-gray-100">{category.label}</p>
        <p className="mt-0.5 text-xs text-gray-50">
          {loading ? '불러오는 중…' : `${total.toLocaleString()}개 제품`}
        </p>
      </div>
      <Icon name="arrow_forward_ios" size={14} />
    </button>
  );
}

export default function CategoryMainPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-surface-warm">
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
          <button
            type="button"
            onClick={() => navigate('/cart')}
            aria-label="장바구니"
            className="active:scale-90 transition-transform"
          >
            <CartIcon size={24} className="text-[#17171C]" />
          </button>
        </div>
      </header>

      <div
        className="flex flex-col gap-2.5 px-4 pt-2"
        style={{ paddingBottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom) + 24px)' }}
      >
        {CATEGORIES.map((c) => (
          <CategoryRow key={c.slug} category={c} />
        ))}

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-gray-50">
          지금은 얼굴용 4종만 다뤄요. 피부타입 진단이 얼굴 기준이라
          바디·헤어 제품은 추천 근거를 만들 수 없어 수집하지 않았어요.
        </p>
      </div>

      <OyBottomNav />
    </div>
  );
}
