import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

// TODO: Task 6 완료 후 실제 API 연동
const MOCK_PRODUCT = {
  id: 1,
  name: '수분 밸런싱 토너 200ml',
  brand: '이니스프리',
  price: 28000,
  originalPrice: 35000,
  discountRate: 20,
  rating: 4.5,
  reviewCount: 1203,
  volume: 200,
};

const MOCK_INGREDIENTS = {
  key: ['히알루론산', '베타글루칸', '판테놀'],
  normal: ['정제수', '부틸렌글라이콜', '글리세린'],
  warn: [],
};

const MOCK_ALTERNATIVES = [
  { id: 2, name: '수분 토너 EX', brand: '코스알엑스', price: 18000, similarity: 92 },
  { id: 3, name: '딥 하이드레이션 토너', brand: '닥터자르트', price: 32000, similarity: 78 },
  { id: 4, name: '수분 광채 토너', brand: '헤라', price: 45000, similarity: 65 },
];

export default function DetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  void id; // TODO: id로 API 호출

  return (
    <PageWrapper>
      <Header
        showBack
        title={MOCK_PRODUCT.name}
        rightSlot={
          <button className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
                stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        }
      />

      {/* 제품 이미지 */}
      <div className="h-60 bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <span className="text-7xl opacity-40">🧴</span>
      </div>

      <div className="px-4 py-4">
        {/* 제품 기본 정보 */}
        <p className="text-sm text-gray-70 mb-1">{MOCK_PRODUCT.brand}</p>
        <h1 className="text-xl font-bold text-gray-100 mb-2">{MOCK_PRODUCT.name}</h1>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-star text-sm">★</span>
          <span className="text-sm text-gray-70">{MOCK_PRODUCT.rating}</span>
          <span className="text-sm text-gray-50">({MOCK_PRODUCT.reviewCount.toLocaleString()})</span>
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-lg font-bold text-accent">{MOCK_PRODUCT.discountRate}%</span>
          <span className="text-2xl font-black text-gray-100">{MOCK_PRODUCT.price.toLocaleString()}원</span>
          <span className="text-sm text-gray-50 line-through">{MOCK_PRODUCT.originalPrice.toLocaleString()}원</span>
        </div>

        {/* 찜/구매 버튼 */}
        <div className="flex gap-2 mb-6">
          <button className="w-12 h-12 rounded-xl bg-accent-light border border-accent/20 flex items-center justify-center active:scale-95 transition-transform">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
                stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex-1">
            <Button variant="next">구매하러 가기</Button>
          </div>
        </div>

        {/* 전성분 섹션 */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-100 mb-3">전성분</h2>
          <div className="mb-2">
            <p className="text-xs text-gray-70 mb-1.5">주요 성분</p>
            <div className="flex flex-wrap gap-1.5">
              {MOCK_INGREDIENTS.key.map(s => <Chip key={s} label={s} variant="good" />)}
            </div>
          </div>
          <div className="mb-2">
            <p className="text-xs text-gray-70 mb-1.5">일반 성분</p>
            <div className="flex flex-wrap gap-1.5">
              {MOCK_INGREDIENTS.normal.map(s => <Chip key={s} label={s} variant="neutral" />)}
              <button className="text-xs text-primary underline">전체 보기</button>
            </div>
          </div>
        </section>

        {/* 대체품 TOP 3 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-light text-primary">AI 분석</span>
            <h2 className="text-base font-bold text-gray-100">이 제품과 비슷한 대체품</h2>
          </div>

          <div className="flex flex-col gap-3">
            {MOCK_ALTERNATIVES.map(alt => (
              <div
                key={alt.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-5 border border-gray-20 active:scale-[.98] transition-transform cursor-pointer"
                onClick={() => navigate(`/detail/${alt.id}`)}
              >
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl opacity-40">🧴</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-70">{alt.brand}</p>
                  <p className="text-sm font-semibold text-gray-100 truncate">{alt.name}</p>
                  <p className="text-sm font-bold text-gray-100 mt-0.5">{alt.price.toLocaleString()}원</p>
                </div>
                <Badge
                  type={alt.similarity >= 80 ? 'sim-high' : 'sim-mid'}
                  label={`${alt.similarity}%`}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
