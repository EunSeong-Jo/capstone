import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { GlassAppBar } from '../../components/layout/GlassAppBar';
import { WeatherBanner } from '../../components/home/WeatherBanner';
import { QuickActions } from '../../components/home/QuickActions';
import { RankingList } from '../../components/home/RankingList';
import { CategoryScroller } from '../../components/home/CategoryScroller';
import { SectionHeader } from '../../components/home/SectionHeader';
import {
  MOCK_HOME_CATEGORIES,
  MOCK_RANKING_PRODUCTS,
  MOCK_WEATHER,
  getSkinCareTip,
} from '../../mocks/home';
import { SkinType } from '../../types';

// TODO: 사용자 store/context 연동 후 실제 피부타입으로 교체
const userSkinType: SkinType = 'ondalsam';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <PageWrapper hasBottomNav className="!bg-atelier-neutral font-body text-atelier-text">
      <GlassAppBar onSearch={() => navigate('/search')} onNotification={() => {}} />

      <main className="px-4 space-y-6 pt-3">
        {/* 1. 날씨 가이드 배너 (피부타입 통합) */}
        <WeatherBanner
          weather={MOCK_WEATHER}
          skinType={userSkinType}
          recommendation={getSkinCareTip(userSkinType, MOCK_WEATHER.condition)}
        />

        {/* 2. 빠른 접근 (제품 스캔은 준비 중 → disabled) */}
        <QuickActions onManual={() => navigate('/search')} />

        {/* 3. 실시간 인기 제품 순위 */}
        <RankingList
          title="실시간 인기 제품"
          products={MOCK_RANKING_PRODUCTS}
          updatedAt="방금 업데이트"
        />

        {/* 4. 인기 카테고리 */}
        <section>
          <SectionHeader overline="Category" title="인기 카테고리" />
          <CategoryScroller
            categories={MOCK_HOME_CATEGORIES}
            onSelect={(id) => navigate(`/category?c=${id}`)}
          />
        </section>
      </main>

      <BottomNav />
    </PageWrapper>
  );
}
