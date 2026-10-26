import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoginPrompt } from '../../../../hooks/useLoginPrompt';
import { useCart } from '../../../../context/cart';
import { useCloset } from '../../../../context/closet';
import { useToast } from '../../../../context/toast';
import { HOME_SIMILARITY_MIN, type SwapSuggestion as SwapItem, useSwapSuggestion } from '../../../../hooks/useSwapSuggestion';
import { SkinType } from '../../../../types';
import { similarToState } from '../../../../utils/alternatives';

/**
 * 오늘의 교체 제안 — 홈 최상단 카드.
 *
 * 화장대의 "쓰던 제품" 하나를 성분이 비슷하면서 더 싼 제품으로 바꾸라고
 * 제안한다. 저장소에서 `sharedKeyIngredients`(서버의 sharedIngredients)를
 * 실제로 그리는 첫 화면이다 — 유사도 숫자만 보여주던 기존 카드들과 달리
 * "왜 비슷한지"를 성분 이름으로 밝힌다.
 *
 * 데이터는 useSwapSuggestion이 전담한다. 이 컴포넌트는 상태 넷(빈 화장대 /
 * 로딩 / 후보 없음 / 오류)을 같은 자리에서 그리는 일만 한다.
 */

function SectionFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="px-4 py-4">
      <h2 className="text-[15px] font-extrabold text-oy-text">오늘의 교체 제안</h2>
      <div className="mt-3 rounded-2xl border border-oy-line bg-white p-4">{children}</div>
    </section>
  );
}

export function SwapSuggestion({ skinType }: { skinType?: SkinType }) {
  const navigate = useNavigate();
  const { requireLogin } = useLoginPrompt();
  const { items, loading: closetLoading } = useCloset();
  const { candidates, betterCandidates, refillCandidates, outcome, loading, error, reload } = useSwapSuggestion(
    items,
    skinType,
  );

  /**
   * "화장대가 비었다"는 조회가 끝난 뒤에만 말할 수 있다.
   *
   * ClosetContext는 로그인 시 빈 배열로 시작한다. 예전에는 이 검사가
   * `loading`보다 앞에 있어서, 화장대에 제품이 있는 사용자도 "제품
   * 등록하기" 안내를 먼저 보고 잠시 뒤 제안 카드로 바뀌었다.
   */
  if (!closetLoading && items.length === 0) {
    return (
      <SectionFrame>
        <p className="text-[13px] leading-relaxed text-oy-sub">
          지금 쓰는 제품을 화장대에 등록하면
          <br />
          성분이 비슷하면서 더 싼 제품을 찾아드려요.
        </p>
        <button
          type="button"
          onClick={() => {
            if (requireLogin('화장대는 로그인하면 쓸 수 있어요')) return;
            navigate('/scan');
          }}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
        >
          제품 등록하기
        </button>
      </SectionFrame>
    );
  }

  if (closetLoading || loading) {
    return (
      <SectionFrame>
        <div className="animate-pulse">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="aspect-square rounded-xl bg-oy-line" />
              <div className="mt-2 h-3 w-2/3 rounded bg-oy-line" />
              <div className="mt-1.5 h-3 w-full rounded bg-oy-line" />
            </div>
            <div className="w-14 shrink-0 pt-10">
              <div className="mx-auto h-8 w-8 rounded-full bg-oy-line" />
            </div>
            <div className="flex-1">
              <div className="aspect-square rounded-xl bg-oy-line" />
              <div className="mt-2 h-3 w-2/3 rounded bg-oy-line" />
              <div className="mt-1.5 h-3 w-full rounded bg-oy-line" />
            </div>
          </div>
          <div className="mt-4 h-10 rounded-xl bg-oy-line" />
        </div>
      </SectionFrame>
    );
  }

  if (error) {
    return (
      <SectionFrame>
        <p className="text-center text-[13px] text-oy-sub">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="mx-auto mt-3 block rounded-full border border-oy-text/20 px-4 py-1.5 text-[13px] font-medium transition-transform active:scale-95"
        >
          다시 시도
        </button>
      </SectionFrame>
    );
  }

  // 화장대 id가 우리 카탈로그의 번호가 아니다. 단종이 아니라 저장된 데이터가
  // 낡은 것이므로, 다시 등록하면 해결된다고 알려준다.
  if (outcome === 'stale') {
    return (
      <SectionFrame>
        <p className="text-[13px] leading-relaxed text-oy-sub">
          화장대에 저장된 제품 정보가 오래돼서
          <br />
          성분을 분석할 수 없어요. 다시 등록해 주세요.
        </p>
        <button
          type="button"
          onClick={() => navigate('/closet')}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
        >
          화장대 정리하기
        </button>
      </SectionFrame>
    );
  }

  // 오늘의 제안이라 종류마다 1등 하나씩만 카드로 두고 옆으로 넘겨 본다. 종류가 비어도 카드는 남기고 "후보가 없어요"라고 말한다.
  // 카드(1순위)는 성분 유사도가 HOME_SIMILARITY_MIN 이상인 제품만 올린다. 전체 보기 목록에는 하한이 없다.
  const forHome = (list: SwapItem[]) => list.filter((c) => c.alt.similarityScore >= HOME_SIMILARITY_MIN);
  // 세 카드가 같은 제품·같은 대체품으로 겹치지 않게, 앞 카드가 쓴 제품(쓰던 제품, 대체품)을 피해 1등을 고른다.
  // 피할 후보가 없으면 원래 1등을 그대로 쓴다.
  const usedSeeds = new Set<number>();
  const usedAlts = new Set<number>();
  const pick = (list: SwapItem[]): SwapItem[] => {
    const first =
      list.find((c) => !usedSeeds.has(c.seed.id) && !usedAlts.has(c.alt.id)) ??
      list.find((c) => !usedAlts.has(c.alt.id)) ??
      list[0];
    if (first) {
      usedSeeds.add(first.seed.id);
      usedAlts.add(first.alt.id);
    }
    return first ? [first, ...list.filter((c) => c !== first)] : list;
  };
  const cheaperHome = pick(forHome(candidates));
  const betterHome = pick(forHome(betterCandidates));
  const refillHome = pick(forHome(refillCandidates));

  // 카드 하나가 한 종류의 1등이다. '전체 보기' 여부는 하한과 무관하게 목록에 더 볼 것이 있는지로 정한다.
  const slots: { kind: SwapKind; list: SwapItem[]; all: SwapItem[] }[] = [
    { kind: 'cheaper', list: cheaperHome, all: candidates },
    { kind: 'better', list: betterHome, all: betterCandidates },
    { kind: 'refill', list: refillHome, all: refillCandidates },
  ];

  return <SwapSlider slots={slots} />;
}

/** 마지막으로 보던 카드 번호. 화면을 벗어났다 돌아와도 유지하려고 모듈에 둔다. */
let lastSlideIndex = 0;

/** 카드 폭을 꽉 채워 한 장씩 넘기고, 제목 옆 점으로 "옆에도 카드가 있다"와 현재 위치를 알린다. */
function SwapSlider({ slots }: { slots: { kind: SwapKind; list: SwapItem[]; all: SwapItem[] }[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(lastSlideIndex);

  // 상세에 들어갔다가 뒤로 오면 홈이 새로 그려져 첫 카드로 돌아간다. 보던 카드로 되돌린다.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el && lastSlideIndex > 0) el.scrollLeft = lastSlideIndex * (el.clientWidth + 12);
  }, []);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    // 카드 폭 + 사이 간격(12px)이 한 칸이다.
    const i = Math.round(el.scrollLeft / (el.clientWidth + 12));
    lastSlideIndex = i;
    setIndex(i);
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    el?.scrollTo({ left: i * (el.clientWidth + 12), behavior: 'smooth' });
  };

  return (
    <section className="px-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold text-oy-text">오늘의 교체 제안</h2>
        <div className="flex gap-1.5">
          {slots.map(({ kind }, i) => (
            <button
              key={kind}
              type="button"
              aria-label={`${KIND_META[kind].label} 보기`}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-4 bg-primary' : 'w-2 bg-oy-line'}`}
            />
          ))}
        </div>
      </div>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slots.map(({ kind, list, all }) => (
          <SwapCard
            key={kind}
            kind={kind}
            suggestion={list[0]}
            // 이 카드의 '쓰던 제품'에 대한 후보 수. 다른 화장대 제품의 후보는 세지 않는다.
            total={all.filter((c) => c.seed.id === list[0]?.seed.id).length}
          />
        ))}
      </div>
    </section>
  );
}

type SwapKind = 'cheaper' | 'better' | 'refill';

const KIND_META: Record<SwapKind, { label: string; chip: string; empty: string }> = {
  cheaper: { label: '더 저렴한 대체품', chip: '대체품', empty: '더 저렴한 대체품 후보가 없어요' },
  better: { label: '더 좋은 대체품', chip: '대체품', empty: '더 좋은 대체품 후보가 없어요' },
  refill: { label: '리필·다른 용량', chip: '같은 제품', empty: '리필·다른 용량 후보가 없어요' },
};

/** 좌우 제품 한 칸. 쓰던 제품과 대체품이 같은 모양을 쓴다. */
function SwapProduct({
  imageUrl,
  chipLabel,
  chipTone,
  brand,
  name,
  onClick,
  children,
}: {
  imageUrl?: string;
  chipLabel: string;
  chipTone: 'used' | 'alt';
  brand: string;
  name: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const chip = chipTone === 'alt' ? 'bg-primary-light text-primary' : 'bg-oy-chip text-oy-sub';

  return (
    <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
      <div className="aspect-square overflow-hidden rounded-xl bg-oy-line">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl opacity-40">🧴</span>
        )}
      </div>
      <span className={`mt-2 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${chip}`}>
        {chipLabel}
      </span>
      <p className="mt-1 truncate text-[10px] font-bold text-oy-sub">{brand}</p>
      <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-oy-text">{name}</p>
      {children}
    </button>
  );
}

/** 한 종류의 제안 카드. 쓰던 제품 → 대체품과 버튼. 후보가 없으면 없다고만 말한다. */
function SwapCard({
  kind,
  suggestion,
  total,
}: {
  kind: SwapKind;
  suggestion: SwapItem | undefined;
  total: number;
}) {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const meta = KIND_META[kind];

  if (!suggestion) {
    return (
      <div className="w-full shrink-0 snap-center rounded-2xl border border-oy-line bg-white p-4">
        <span className="text-[13px] font-extrabold text-oy-sub">{meta.label}</span>
        <p className="mt-1.5 text-[13px] text-oy-sub">{meta.empty}</p>
      </div>
    );
  }

  const { seed, alt, fitGain } = suggestion;
  const delta = alt.priceDelta ?? 0;

  const addAltToCart = () => {
    addToCart({
      id: alt.id,
      name: alt.name,
      brand: alt.brand,
      price: alt.price,
      imageUrl: alt.imageUrl,
    });
    // 담자마자 장바구니로 끌고 가지 않는다. 홈에서 제안을 더 볼 수 있고,
    // 가려면 토스트의 링크로 간다.
    showToast('장바구니에 담았어요', {
      label: '장바구니로',
      onClick: () => navigate('/cart'),
    });
  };

  const shared = alt.sharedKeyIngredients?.slice(0, 3) ?? [];

  return (
    <div className="flex w-full shrink-0 snap-center flex-col rounded-2xl border border-oy-line bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13px] font-extrabold text-oy-text">{meta.label}</span>
        {total > 1 && (
          <button
            type="button"
            onClick={() => navigate(`/home/cheaper-alternatives?seed=${seed.id}`)}
            className="text-[12px] font-bold text-primary active:opacity-60"
          >
            전체 보기 ›
          </button>
        )}
      </div>

      <div className="flex items-start gap-2">
        <SwapProduct
          imageUrl={seed.imageUrl}
          chipLabel="쓰던 제품"
          chipTone="used"
          brand={seed.brand}
          name={seed.name}
          onClick={() => navigate(`/detail/${seed.id}`)}
        >
          <p className="mt-0.5 text-[12px] font-semibold text-oy-sub line-through">
            {(seed.price ?? 0).toLocaleString()}원
          </p>
        </SwapProduct>

        {/* 화살표 + 유사도. 두 카드 사이 고정 폭이라 제품명 길이에 영향받지 않는다. */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-1 pt-[24%]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light text-[15px] font-bold text-primary">
            →
          </span>
          <span className="text-[10px] font-bold text-primary">유사도 {alt.similarityScore}%</span>
        </div>

        <SwapProduct
          imageUrl={alt.imageUrl}
          chipLabel={meta.chip}
          chipTone="alt"
          brand={alt.brand}
          name={alt.name}
          onClick={() => navigate(`/detail/${alt.id}`, { state: similarToState(alt) })}
        >
          <p className="mt-0.5 text-[12px] font-extrabold text-oy-text">
            {alt.price.toLocaleString()}원{' '}
            {delta < 0 ? (
              <span className="text-accent">−{(-delta).toLocaleString()}</span>
            ) : delta > 0 ? (
              <span className="text-oy-sub">+{delta.toLocaleString()}</span>
            ) : null}
          </p>
          {kind === 'better' && fitGain !== undefined && (
            <p className="mt-0.5 text-[11px] font-bold text-primary">내 피부 궁합 +{fitGain}점</p>
          )}
        </SwapProduct>
      </div>

      {kind !== 'refill' && shared.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 border-t border-oy-line pt-3">
          <span className="text-[11px] text-oy-sub">공통 핵심 성분</span>
          {shared.map((ing) => (
            <span
              key={ing}
              className="rounded-full bg-oy-chip px-2 py-0.5 text-[11px] font-semibold text-oy-text"
            >
              {ing}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-3">
        {kind === 'refill' ? (
          <button
            type="button"
            onClick={() => navigate(`/detail/${alt.id}`, { state: similarToState(alt) })}
            className="flex-1 rounded-xl border border-oy-line bg-white py-3 text-[13px] font-bold text-oy-text transition-transform active:scale-[.98]"
          >
            상세 보기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate(`/compare?a=${seed.id}&b=${alt.id}`, { state: similarToState(alt) })}
            className="flex-1 rounded-xl border border-oy-line bg-white py-3 text-[13px] font-bold text-oy-text transition-transform active:scale-[.98]"
          >
            성분 비교
          </button>
        )}
        <button
          type="button"
          onClick={addAltToCart}
          className="flex-[1.6] rounded-xl bg-primary py-3 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
        >
          장바구니에 담기
        </button>
      </div>
    </div>
  );
}
