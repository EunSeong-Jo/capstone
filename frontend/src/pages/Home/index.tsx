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
  CharacterState,
  ProfileUser,
  RegistrySummary,
  SKIN_TYPE_META,
  Product,
} from '../../types';
import { useRecommendations } from '../../hooks/useRecommendations';
import { useStats } from '../../hooks/useStats';
import { useSkinType } from '../../hooks/useSkinType';
import { HOME_SIMILARITY_MIN, totalSavingOf, useSwapSuggestion } from '../../hooks/useSwapSuggestion';
import { useClosetSimilar } from '../../hooks/useClosetSimilar';
import { useWeather } from '../../hooks/useWeather';
import { useCareTip } from '../../hooks/useCareTip';
import { useAuth } from '../../context/auth';
import { useCloset } from '../../context/closet';
import { useCart } from '../../context/cart';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';

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

export default function HomePage() {
  const navigate = useNavigate();
  const { user: persona, isUser } = useAuth();
  const { items: closetItems, loading: closetLoading } = useCloset();
  const { stats, loading: statsLoading } = useStats();
  const { addToCart } = useCart();
  const { requireLogin } = useLoginPrompt();
  const [setOpen, setSetOpen] = useState(false);

  /**
   * 피부타입은 세 상태다 — 모른다(확인 중) / 진단 전 / 확정.
   *
   * 예전에는 `?? 'ondalsam'`으로 뭉개서, 진단 응답 전에도 진단을 한 적이
   * 없어도 옹달샘으로 확정됐다. 마스코트·칩·캐러셀 제목·추천 요청이 전부
   * 그 값을 썼다.
   */
  const { skinType, loading: skinPending } = useSkinType();
  const skinLabel = skinType !== null ? SKIN_TYPE_META[skinType].label : null;

  const owned = closetItems.map((c) => ({ id: c.id, brand: c.brand, name: c.name }));
  // 추천 세트(예산 가이드)가 새로 살 루틴에서 뺄 보유품. 배열이 매번 새로 생기면 캐시 키는 같아도 렌더가 헛돈다.
  const ownedIds = useMemo(() => closetItems.map((c) => c.id), [closetItems]);
  const {
    forYou,
    loading,
    error: recError,
    reload: recReload,
  } = useRecommendations(skinType, skinPending, owned);

  const { weather } = useWeather();
  // 사용자가 직접 고친 프로필(닉네임 등)은 UserProfileContext가 들고 있다.
  // 로그인 페르소나가 없을 때의 표시값으로 쓴다.
  const { profile } = useUserProfile();
  const { tip: careTip } = useCareTip(skinType, skinPending, weather?.condition ?? 'sunny');

  // 화장대 **전체**를 기준으로 한 비슷한 추천(후보마다 가장 비슷한 화장대 제품 기준).
  const closetSimilar = useClosetSimilar(closetItems, closetLoading, skinType ?? undefined);

  // 홈의 "더 저렴한 대체품"과 대시보드 절약액이 쓰는 실제 후보.
  // 예전에는 이 자리에 mocks/alternatives.ts의 고정 목업이 있었는데, 가짜
  // 제품에 붙은 id(102~109)가 실재 카탈로그 id와 겹쳐 카드를 탭하면 전혀
  // 다른 제품 상세가 열렸다.
  const swap = useSwapSuggestion(closetItems, skinType ?? undefined);

  // 화장대 제품들을 실제로 바꿨을 때 아낄 수 있는 금액. 후보가 없으면
  // undefined이고 대시보드가 문구를 바꾼다 — 고정값을 그리지 않는다.
  const totalSavings = useMemo(() => {
    // 홈 카드와 같은 하한을 적용해 카드에 보이는 제품의 합계가 되게 한다.
    const shown = swap.candidates.filter((c) => c.alt.similarityScore >= HOME_SIMILARITY_MIN);
    if (shown.length === 0) return undefined;
    return totalSavingOf(shown);
  }, [swap.candidates]);

  // 로그인 시 페르소나/진단/화장대에서 대시보드 값 구성, 게스트는 목업 유지
  const dashUser: ProfileUser = isUser && persona
    ? { nickname: persona.nickname, skinType, memberSince: persona.memberSince, email: persona.email }
    : { ...profile, skinType };
  /**
   * 레벨·경험치는 `GET /me/stats`가 **기록에서 계산해** 준다(스캔·후기·
   * 주문·선물). 클라이언트가 더해 나가지 않으므로 기기를 바꿔도 같다.
   *
   * 비회원은 stats가 null이라 값을 넘기지 않고, ProfileDashboard가 그 줄을
   * 통째로 숨긴다 — 근거 없는 숫자를 그리지 않기 위해서다.
   */
  const dashCharacter: CharacterState = {
    skinType,
    expression: 'neutral',
    ...(stats
      ? {
          level: stats.level,
          exp: stats.expInLevel,
          nextLevelExp: stats.levelSpan,
        }
      : {}),
  };
  const dashRegistry: RegistrySummary = {
    count: closetItems.length,
    totalSavings,
  };

  const addSetToCart = (products: Product[]) => {
    products.forEach((p) =>
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

        {/* 개인 대시보드: 날씨 + 마스코트(탭→옷장) + 경험치

            levelPending: useStats는 비회원을 확정했을 때만 loading을 내린다.
            그래서 이 값 하나로 "비회원이라 없음"과 "곧 온다"가 갈린다. */}
        <ProfileDashboard
          weather={weather}
          careTip={careTip}
          character={dashCharacter}
          levelPending={statsLoading}
          skinPending={skinPending}
          user={dashUser}
          registry={dashRegistry}
        />
        <Divider />

        {/* 오늘의 교체 제안 — 화장대 기반, 홈의 첫 카드 */}
        <SwapSuggestion skinType={skinType ?? undefined} />
        <Divider />

        {/* 피부타입 맞춤 추천.

            진단 전에는 서버도 개인화하지 않고 인기순으로 응답한다
            (recommendations_main.py의 skinType 기본값이 None). 그러니 제목도
            개인화인 척하지 않는다 — "옹달샘을 위한 상품"이 그 척이었다. */}
        <ProductCarousel
          title={
            skinLabel !== null ? `${withObjParticle(skinLabel)} 위한 상품` : '요즘 인기 있는 상품'
          }
          products={forYou}
        />
        {loading && forYou.length === 0 && <CarouselSkeleton />}
        {recError && forYou.length === 0 && (
          <CarouselError message={recError} onRetry={recReload} />
        )}
        <Divider />

        {/* 내 화장대와 비슷한 추천 — 카테고리별 구역.
            화장대에 있는 카테고리마다 따로 그린다(스킨케어·마스크팩·클렌징·선케어). 구역 안에서는
            그 카테고리의 화장대 제품 전체를 기준으로 비슷한 순이다. "어느 제품과 비슷한지"는 카드가 좁아
            잘리므로 카드를 눌러 상세로 들어갔을 때 보여 준다.
            화장대가 비었거나 유사도가 아직 없으면 구역을 그리지 않는다
            (빈 자리를 목업으로 채우던 것이 id 충돌 버그의 원인이었다). */}
        {closetSimilar.groups.map((g) => (
          <div key={g.category}>
            <AlternativeCarousel
              title={`🧴 내 ${g.category} 제품과 비슷한 추천`}
              alternatives={g.alternatives}
              onMore={
                g.seedId !== undefined
                  ? () => navigate(`/alternatives?seed=${g.seedId}&from=home`)
                  : undefined
              }
            />
            <Divider />
          </div>
        ))}
      </main>

      <OyFloatingActions
        onChatbot={() => navigate('/mypage/chat-support')}
        onRecommendSet={() => {
          // 추천세트는 화장대 예산으로 짠다 — 로그인 전용.
          if (requireLogin('추천세트는 로그인하면 볼 수 있어요')) return;
          setSetOpen(true);
        }}
      />
      <OyBottomNav />

      <RecommendSetSheet
        open={setOpen}
        onClose={() => setSetOpen(false)}
        nickname={dashUser.nickname}
        skinType={skinType}
        ownedIds={ownedIds}
        onAddAll={addSetToCart}
      />
    </div>
  );
}
