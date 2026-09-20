import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OyAppBar } from '../../components/home/oy/OyAppBar';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { OyFloatingActions } from '../../components/home/oy/OyFloatingActions';
import { RecommendSetSheet } from '../../components/home/oy/RecommendSetSheet';
import { ProfileDashboard } from '../../components/home/oy/sections/ProfileDashboard';
import { ProductCarousel } from '../../components/home/oy/sections/ProductCarousel';
import { AlternativeCarousel } from '../../components/home/oy/sections/AlternativeCarousel';
import { SwapSuggestion } from '../../components/home/oy/sections/SwapSuggestion';
import { useUserProfile } from '../../context/userProfile';
import {
  Alternative,
  CharacterState,
  ProfileUser,
  RegistrySummary,
  SKIN_TYPE_META,
  SkinType,
} from '../../types';
import { useProducts } from '../../hooks/useProducts';
import { useRecommendations } from '../../hooks/useRecommendations';
import { useSimilarProducts } from '../../hooks/useSimilarProducts';
import { useSwapSuggestion } from '../../hooks/useSwapSuggestion';
import { useWeather } from '../../hooks/useWeather';
import { useCareTip } from '../../hooks/useCareTip';
import { useAuth } from '../../context/auth';
import { useDiagnosis } from '../../context/diagnosis';
import { useCloset } from '../../context/closet';
import { useCart } from '../../context/cart';

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

/**
 * 목업 폴백이 켜진 환경(로컬 개발)에서만 뜬다. 화면이 실제 DB가 아니라
 * mocks/oliveyoung.ts를 보고 있다는 사실을 숨기지 않기 위한 것이다.
 */
function MockBanner() {
  return (
    <div className="bg-amber-100 px-4 py-2 text-[12px] font-semibold text-amber-900">
      ⚠️ 목업 데이터 — 백엔드 응답이 없어 예시 상품을 보여주고 있어요
    </div>
  );
}

const DEFAULT_SKIN: SkinType = 'ondalsam';

export default function HomePage() {
  const navigate = useNavigate();
  const { user: persona, isUser } = useAuth();
  const { skinType: diagType, justSucceeded, acknowledgeSuccession } = useDiagnosis();
  const { items: closetItems } = useCloset();
  const { addToCart } = useCart();
  const [setOpen, setSetOpen] = useState(false);

  const skinType: SkinType = diagType ?? persona?.skinType ?? DEFAULT_SKIN;
  const skinLabel = SKIN_TYPE_META[skinType].label;

  const owned = closetItems.map((c) => ({ id: c.id, brand: c.brand, name: c.name }));
  const {
    forYou,
    set,
    error: recError,
    reload: recReload,
  } = useRecommendations(skinType, owned);

  // 계절 맞춤 캐러셀은 개인화와 무관한 별도 풀
  const {
    products: seasonalPool,
    loading,
    isMock: seasonalIsMock,
    error: seasonalError,
    reload: seasonalReload,
  } = useProducts({ size: 12, sort: 'rating' });
  const seasonal = seasonalPool.slice(0, 6);

  // 계절 캐러셀이 목업으로 채워졌으면 화면에 알린다 (추천은 서버 전용이라 폴백이 없다)
  const isMock = seasonalIsMock;

  const { weather } = useWeather();
  // 사용자가 직접 고친 프로필(닉네임 등)은 UserProfileContext가 들고 있다.
  // 로그인 페르소나가 없을 때의 표시값으로 쓴다.
  const { profile } = useUserProfile();
  const { tip: careTip } = useCareTip(skinType, weather?.condition ?? 'sunny');

  const registrySeedId = closetItems[0]?.id;

  // 화장대 첫 항목의 실제 성분 유사도. 화장대 id가 카탈로그 id가 된 뒤로
  // 여기서 진짜 점수를 쓸 수 있다.
  const registrySeed = closetItems[0];
  const registrySimilar = useSimilarProducts(
    registrySeedId,
    {
      limit: 6,
      seedProduct: registrySeed
        ? { id: registrySeed.id, price: registrySeed.price ?? 0 }
        : null,
    },
  );

  // 홈의 "더 저렴한 대체품"과 대시보드 절약액이 쓰는 실제 후보.
  // 예전에는 이 자리에 mocks/alternatives.ts의 고정 목업이 있었는데, 가짜
  // 제품에 붙은 id(102~109)가 실재 카탈로그 id와 겹쳐 카드를 탭하면 전혀
  // 다른 제품 상세가 열렸다.
  const swap = useSwapSuggestion(closetItems, skinType);

  // 화장대 제품들을 실제로 바꿨을 때 아낄 수 있는 금액. 후보가 없으면
  // undefined이고 대시보드가 문구를 바꾼다 — 고정값을 그리지 않는다.
  const totalSavings = useMemo(() => {
    if (swap.candidates.length === 0) return undefined;
    return swap.candidates.reduce((sum, c) => sum + -(c.alt.priceDelta ?? 0), 0);
  }, [swap.candidates]);

  // 캐러셀이 받는 모양(Alternative[])으로. seed는 카드가 쓰지 않는다.
  const cheaperAlternatives: Alternative[] = useMemo(
    () => swap.candidates.map((c) => c.alt),
    [swap.candidates],
  );

  // "내 화장대와 비슷한 추천" — 화장대 첫 항목의 실제 성분 유사도만 쓴다.
  // 유사도가 아직 없는 제품이면 빈 배열이고, 캐러셀이 그리지 않는다.
  const registryAlternatives: Alternative[] = registrySimilar.alternatives;

  // 로그인 시 페르소나/진단/화장대에서 대시보드 값 구성, 게스트는 목업 유지
  const dashUser: ProfileUser = isUser && persona
    ? { nickname: persona.nickname, skinType, memberSince: persona.memberSince, email: persona.email }
    : { ...profile, skinType };
  // 레벨·경험치는 서버 근거가 없어 넘기지 않는다(ProfileDashboard가 줄을 숨긴다).
  const dashCharacter: CharacterState = { skinType, expression: 'neutral' };
  const dashRegistry: RegistrySummary = {
    count: closetItems.length,
    totalSavings,
  };

  const addSetToCart = () => {
    set.items.forEach((p) =>
      addToCart({ id: p.id, name: p.name, brand: p.brand, price: p.price, imageUrl: p.imageUrl }),
    );
    setSetOpen(false);
    navigate('/cart');
  };

  return (
    <div
      className="flex flex-col min-h-dvh bg-surface-warm text-oy-text font-sans"
      style={{ paddingBottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom))' }}
    >
      <OyAppBar />

      <main>
        {isMock && <MockBanner />}
        {justSucceeded && (
          <button
            onClick={acknowledgeSuccession}
            className="block w-full bg-primary-light px-4 py-2.5 text-left text-[12px] font-semibold text-primary-dark"
          >
            ✅ 로그인 전 진단한 피부타입({skinLabel})을 계정으로 가져왔어요. 탭하여 닫기
          </button>
        )}

        {/* 개인 대시보드: 날씨 + 마스코트(탭→옷장) + 경험치 */}
        <ProfileDashboard
          weather={weather}
          careTip={careTip}
          character={dashCharacter}
          user={dashUser}
          registry={dashRegistry}
        />
        <Divider />

        {/* 오늘의 교체 제안 — 화장대 기반, 홈의 첫 카드 */}
        <SwapSuggestion skinType={skinType} />
        <Divider />

        {/* 피부타입 맞춤 추천 */}
        <ProductCarousel title={`${withObjParticle(skinLabel)} 위한 상품`} products={forYou} ad />
        {loading && forYou.length === 0 && <CarouselSkeleton />}
        {recError && forYou.length === 0 && (
          <CarouselError message={recError} onRetry={recReload} />
        )}
        <Divider />

        {/* 대체품 추천 (핵심): 내 화장대 성분 기반.
            화장대가 비었거나 유사도가 아직 없으면 섹션을 아예 그리지 않는다.
            빈 자리를 목업으로 채우던 것이 id 충돌 버그의 원인이었다. */}
        {registrySeedId !== undefined && registryAlternatives.length > 0 && (
          <>
            <AlternativeCarousel
              title="🧴 내 화장대와 비슷한 추천"
              alternatives={registryAlternatives}
              onMore={() => navigate(`/alternatives?seed=${registrySeedId}&from=home`)}
            />
            <Divider />
          </>
        )}

        {/* 날씨·계절 맞춤 (대시보드 날씨 연계) */}
        <ProductCarousel
          title={`🌤 ${weather?.seasonLabel ?? '요즘'} 맞춤, 수분 집중 추천`}
          products={seasonal}
        />
        {loading && seasonal.length === 0 && <CarouselSkeleton />}
        {seasonalError && seasonal.length === 0 && (
          <CarouselError message={seasonalError} onRetry={seasonalReload} />
        )}
        <Divider />

        {/* 더 저렴한 대체품 (가격절약 축) — 화장대 전체에서 절약액 순.
            useSwapSuggestion이 같은 조회를 이미 했으므로 추가 요청이 없다. */}
        {cheaperAlternatives.length > 0 && (
          <AlternativeCarousel
            title="💰 더 저렴한 대체품"
            alternatives={cheaperAlternatives}
            onMore={() =>
              navigate(`/alternatives?seed=${swap.candidates[0].seed.id}&from=home`)
            }
          />
        )}
      </main>

      <OyFloatingActions
        onChatbot={() => navigate('/mypage/chat-support')}
        onRecommendSet={() => setSetOpen(true)}
      />
      <OyBottomNav />

      <RecommendSetSheet
        open={setOpen}
        onClose={() => setSetOpen(false)}
        nickname={dashUser.nickname}
        set={set}
        error={recError}
        onRetry={recReload}
        onAddAll={addSetToCart}
      />
    </div>
  );
}
