import { useNavigate } from 'react-router-dom';
import { OyAppBar } from '../../components/home/oy/OyAppBar';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { OyFloatingActions } from '../../components/home/oy/OyFloatingActions';
import { ProfileDashboard } from '../../components/home/oy/sections/ProfileDashboard';
import { ProductCarousel } from '../../components/home/oy/sections/ProductCarousel';
import { AlternativeCarousel } from '../../components/home/oy/sections/AlternativeCarousel';
import { OY_PRODUCTS } from '../../mocks/oliveyoung';
import { MOCK_WEATHER, MOCK_CHARACTER, MOCK_PROFILE, MOCK_REGISTRY } from '../../mocks/home';
import { MOCK_ALTERNATIVES_FOR_REGISTRY, MOCK_CHEAPER_ALTERNATIVES } from '../../mocks/alternatives';
import { SKIN_TYPE_META, SkinType } from '../../types';

/** 섹션 사이 굵은 회색 구분 띠 (올리브영식 리듬) */
function Divider() {
  return <div className="h-2 bg-oy-line" />;
}

/** 한글 목적격 조사 을/를 (받침 유무) */
function withObjParticle(word: string) {
  const last = word.charCodeAt(word.length - 1);
  const hasJong = (last - 0xac00) % 28 !== 0;
  return word + (hasJong ? '을' : '를');
}

// TODO: 사용자 store/context 연동 후 실제 피부타입으로 교체
const userSkinType: SkinType = 'ondalsam';

export default function HomePage() {
  const navigate = useNavigate();
  const skinLabel = SKIN_TYPE_META[userSkinType].label;
  const registrySeedId = MOCK_ALTERNATIVES_FOR_REGISTRY[0]?.seedId ?? 6;

  return (
    <div
      className="flex flex-col min-h-dvh bg-surface-warm text-oy-text font-sans"
      style={{ paddingBottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom))' }}
    >
      <OyAppBar />

      <main>
        {/* 개인 대시보드: 날씨 + 마스코트(탭→옷장) + 경험치 */}
        <ProfileDashboard weather={MOCK_WEATHER} character={MOCK_CHARACTER} user={MOCK_PROFILE} registry={MOCK_REGISTRY} />
        <Divider />

        {/* 피부타입 맞춤 추천 */}
        <ProductCarousel title={`${withObjParticle(skinLabel)} 위한 상품`} products={OY_PRODUCTS.slice(0, 6)} ad />
        <Divider />

        {/* 대체품 추천 (핵심): 내 화장대 성분 기반 */}
        <AlternativeCarousel
          title="🧴 내 화장대와 비슷한 추천"
          alternatives={MOCK_ALTERNATIVES_FOR_REGISTRY}
          onMore={() => navigate(`/alternatives?seed=${registrySeedId}&from=home`)}
        />
        <Divider />

        {/* 날씨·계절 맞춤 (대시보드 날씨 연계) */}
        <ProductCarousel
          title={`🌤 ${MOCK_WEATHER.seasonLabel} 맞춤, 수분 집중 추천`}
          products={OY_PRODUCTS.slice(2, 8)}
        />
        <Divider />

        {/* 더 저렴한 대체품 (가격절약 축) */}
        <AlternativeCarousel
          title="💰 더 저렴한 대체품"
          alternatives={MOCK_CHEAPER_ALTERNATIVES}
          onMore={() => navigate(`/alternatives?seed=${MOCK_CHEAPER_ALTERNATIVES[0]?.seedId ?? 1}&from=home`)}
        />
      </main>

      <OyFloatingActions />
      <OyBottomNav />
    </div>
  );
}
