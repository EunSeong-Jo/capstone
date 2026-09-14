import { useNavigate } from 'react-router-dom';
import { OyAppBar } from '../../components/home/oy/OyAppBar';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { OyFloatingActions } from '../../components/home/oy/OyFloatingActions';
import { ProfileDashboard } from '../../components/home/oy/sections/ProfileDashboard';
import { ProductCarousel } from '../../components/home/oy/sections/ProductCarousel';
import { AlternativeCarousel } from '../../components/home/oy/sections/AlternativeCarousel';
import { MOCK_CHARACTER, MOCK_REGISTRY } from '../../mocks/home';
import { useUserProfile } from '../../context/userProfile';
import { MOCK_ALTERNATIVES_FOR_REGISTRY, MOCK_CHEAPER_ALTERNATIVES } from '../../mocks/alternatives';
import { SKIN_TYPE_META, SkinType } from '../../types';
import { useProducts } from '../../hooks/useProducts';
import { useWeather } from '../../hooks/useWeather';
import { useCareTip } from '../../hooks/useCareTip';

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

/** 캐러셀 자리를 채우는 로딩 자리표시자. 카드 높이(w-[150px])에 맞춘다. */
function CarouselSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden px-4 pb-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="w-[150px] shrink-0 animate-pulse">
          <div className="aspect-square rounded-lg bg-oy-line" />
          <div className="mt-2 h-3 w-2/3 rounded bg-oy-line" />
          <div className="mt-1.5 h-3 w-full rounded bg-oy-line" />
          <div className="mt-1.5 h-3 w-1/2 rounded bg-oy-line" />
        </div>
      ))}
    </div>
  );
}

function CarouselError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-4 mb-4 rounded-lg bg-oy-line/60 px-4 py-6 text-center">
      <p className="text-sm text-oy-sub">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-full border border-oy-text/20 px-4 py-1.5 text-sm font-medium active:scale-95"
      >
        다시 시도
      </button>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const skinLabel = SKIN_TYPE_META[userSkinType].label;
  const registrySeedId = MOCK_ALTERNATIVES_FOR_REGISTRY[0]?.seedId ?? 6;

  // 두 캐러셀이 나눠 쓸 12건을 한 번에 받는다.
  // TODO(Task 14): 지금은 리뷰 수 순(popular)이라 피부타입 개인화가 아니다.
  //   profiles·similarities가 채워지면 추천 API로 교체한다.
  const { products, loading, error, reload } = useProducts({ size: 12 });
  const { weather } = useWeather();
  const { profile } = useUserProfile();
  // weather가 아직 null(로딩 중)이어도 케어 문구 조회는 막지 않는다 — 서버가
  // "오늘 날씨"를 알아서 판단하므로 condition은 실패 시 정적 폴백에만 쓰인다.
  const { tip: careTip } = useCareTip(userSkinType, weather?.condition ?? 'sunny');
  const forYou = products.slice(0, 6);
  const seasonal = products.slice(6, 12);

  return (
    <div
      className="flex flex-col min-h-dvh bg-surface-warm text-oy-text font-sans"
      style={{ paddingBottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom))' }}
    >
      <OyAppBar />

      <main>
        {/* 개인 대시보드: 날씨 + 마스코트(탭→옷장) + 경험치 */}
        <ProfileDashboard weather={weather} careTip={careTip} character={MOCK_CHARACTER} user={profile} registry={MOCK_REGISTRY} />
        <Divider />

        {/* 피부타입 맞춤 추천 */}
        <ProductCarousel title={`${withObjParticle(skinLabel)} 위한 상품`} products={forYou} ad />
        {loading && <CarouselSkeleton />}
        {error && <CarouselError message={error} onRetry={reload} />}
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
          title={`🌤 ${weather?.seasonLabel ?? '요즘'} 맞춤, 수분 집중 추천`}
          products={seasonal}
        />
        {loading && <CarouselSkeleton />}
        <Divider />

        {/* 더 저렴한 대체품 (가격절약 축) */}
        <AlternativeCarousel
          title="💰 더 저렴한 대체품"
          alternatives={MOCK_CHEAPER_ALTERNATIVES}
          onMore={() => navigate(`/alternatives?seed=${MOCK_CHEAPER_ALTERNATIVES[0]?.seedId ?? 1}&from=home`)}
        />
      </main>

      <OyFloatingActions onChatbot={() => navigate('/mypage/chat-support')} />
      <OyBottomNav />
    </div>
  );
}
