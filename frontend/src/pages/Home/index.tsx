import { useMemo } from 'react';
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
import { useWeather } from '../../hooks/useWeather';
import { useCareTip } from '../../hooks/useCareTip';
import { useAuth } from '../../context/AuthContext';
import { useDiagnosis } from '../../context/DiagnosisContext';
import { useCloset } from '../../context/ClosetContext';
import { useCart } from '../../context/CartContext';

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

  const skinType: SkinType = diagType ?? persona?.skinType ?? DEFAULT_SKIN;
  const skinLabel = SKIN_TYPE_META[skinType].label;

  const owned = closetItems.map((c) => ({ id: c.id, brand: c.brand, name: c.name }));
  const {
    forYou,
    set,
    isMock: recIsMock,
    error: recError,
    reload: recReload,
  } = useRecommendations(skinType, owned);

  // 계절 맞춤 캐러셀은 개인화와 무관한 별도 풀
  const {
    products: seasonalPool,
    loading,
    isMock: seasonalIsMock,
  } = useProducts({ size: 12, sort: 'rating' });
  const seasonal = seasonalPool.slice(0, 6);

  // 두 조회 중 하나라도 목업으로 채워졌으면 화면에 알린다
  const isMock = recIsMock || seasonalIsMock;

  const { weather } = useWeather();
  // 사용자가 직접 고친 프로필(닉네임 등)은 UserProfileContext가 들고 있다.
  // 로그인 페르소나가 없을 때의 표시값으로 쓴다.
  const { profile } = useUserProfile();
  const { tip: careTip } = useCareTip(skinType, weather?.condition ?? 'sunny');

  const registrySeedId = closetItems[0]?.id ?? MOCK_ALTERNATIVES_FOR_REGISTRY[0]?.seedId ?? 6;

  // 화장대에 등록한 제품과 같은 카테고리 위주로 골라 "화장대와 비슷한 추천"을 실제로 반영한다.
  // 화장대가 비어있으면(신규 게스트 등) 기존 고정 목업으로 대체.
  const registryAlternatives: Alternative[] = useMemo(() => {
    if (closetItems.length === 0) return MOCK_ALTERNATIVES_FOR_REGISTRY;
    const closetCategories = new Set(closetItems.map((c) => c.category));
    const related = forYou.filter((p) => closetCategories.has(p.category));
    const pool = (related.length > 0 ? related : forYou).slice(0, 6);
    return pool.map((p, i) => ({
      ...p,
      similarityScore: Math.max(60, 92 - i * 6),
      seedId: closetItems[0]?.id,
    }));
  }, [closetItems, forYou]);

  // 로그인 시 페르소나/진단/화장대에서 대시보드 값 구성, 게스트는 목업 유지
  const dashUser: ProfileUser = isUser && persona
    ? { nickname: persona.nickname, skinType, memberSince: persona.memberSince, idNo: profile.idNo }
    : { ...profile, skinType };
  const dashCharacter: CharacterState = { ...MOCK_CHARACTER, skinType };
  const dashRegistry: RegistrySummary = {
    count: closetItems.length || MOCK_REGISTRY.count,
    totalSavings: MOCK_REGISTRY.totalSavings,
    recent: MOCK_REGISTRY.recent,
  };

  const addSetToCart = () => {
    set.items.forEach((p) =>
      addToCart({ id: p.id, name: p.name, brand: p.brand, price: p.price, imageUrl: p.imageUrl }),
    );
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

        {/* 피부타입 맞춤 추천 세트 */}
        <section className="px-4 py-4">
          <h2 className="text-[15px] font-extrabold text-oy-text">
            🎯 {dashUser.nickname}님 맞춤 추천 세트
          </h2>
          <p className="mt-0.5 text-[11px] text-oy-sub">{set.rationale}</p>
          {set.items.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-oy-line bg-white p-3">
              <div className="flex gap-2">
                {set.items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/detail/${p.id}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="aspect-square overflow-hidden rounded-lg bg-oy-line">
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <p className="mt-1 truncate text-[10px] font-bold text-oy-sub">{p.brand}</p>
                    <p className="truncate text-[11px] font-semibold text-oy-text">{p.name}</p>
                    <p className="text-[11px] font-extrabold text-oy-text">
                      {p.price.toLocaleString()}원
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-oy-line pt-3">
                <span className="text-[12px] font-bold text-oy-text">
                  세트 합계 {set.total.toLocaleString()}원
                </span>
                <button
                  onClick={addSetToCart}
                  className="rounded-full px-4 py-2 text-[12px] font-bold text-white active:scale-95 transition-transform"
                  style={{ background: '#00916D' }}
                >
                  장바구니에 담기
                </button>
              </div>
            </div>
          ) : recError ? (
            <CarouselError message={recError} onRetry={recReload} />
          ) : (
            <CarouselSkeleton />
          )}
        </section>
        <Divider />

        {/* 피부타입 맞춤 추천 */}
        <ProductCarousel title={`${withObjParticle(skinLabel)} 위한 상품`} products={forYou} ad />
        {loading && forYou.length === 0 && <CarouselSkeleton />}
        {recError && forYou.length === 0 && (
          <CarouselError message={recError} onRetry={recReload} />
        )}
        <Divider />

        {/* 대체품 추천 (핵심): 내 화장대 성분 기반 */}
        <AlternativeCarousel
          title="🧴 내 화장대와 비슷한 추천"
          alternatives={registryAlternatives}
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
