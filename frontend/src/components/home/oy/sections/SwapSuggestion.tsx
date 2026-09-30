import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../../context/cart';
import { useCloset } from '../../../../context/closet';
import { useToast } from '../../../../context/toast';
import { useSwapSuggestion } from '../../../../hooks/useSwapSuggestion';
import { SkinType } from '../../../../types';

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

function SectionFrame({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <section className="px-4 py-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-extrabold text-oy-text">오늘의 교체 제안</h2>
        {count !== undefined && (
          <span className="text-[11px] text-oy-sub">성분 유사도 기준 · {count}건</span>
        )}
      </div>
      <div className="mt-3 rounded-2xl border border-oy-line bg-white p-4">{children}</div>
    </section>
  );
}

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
  const chip =
    chipTone === 'alt'
      ? 'bg-primary-light text-primary'
      : 'bg-oy-chip text-oy-sub';

  return (
    <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
      <div className="aspect-square overflow-hidden rounded-xl bg-oy-line">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl opacity-40">
            🧴
          </span>
        )}
      </div>
      <span
        className={`mt-2 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${chip}`}
      >
        {chipLabel}
      </span>
      <p className="mt-1 truncate text-[10px] font-bold text-oy-sub">{brand}</p>
      <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-oy-text">{name}</p>
      {children}
    </button>
  );
}

export function SwapSuggestion({ skinType }: { skinType?: SkinType }) {
  const navigate = useNavigate();
  const { items, analyzedItems, loading: closetLoading } = useCloset();
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const { suggestion, outcome, variantHint, loading, error, reload } = useSwapSuggestion(
    analyzedItems,
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
          onClick={() => navigate('/scan')}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
        >
          제품 등록하기
        </button>
      </SectionFrame>
    );
  }

  // 등록은 했지만 분석한 제품이 없으면 대체품을 찾지 않는다.
  if (!closetLoading && analyzedItems.length === 0) {
    return (
      <SectionFrame>
        <p className="text-[13px] leading-relaxed text-oy-sub">
          아직 분석한 제품이 없어요.
          <br />
          화장대에서 분석하기를 누르면 더 싼 대체품을 찾아드려요.
        </p>
        <button
          type="button"
          onClick={() => navigate('/closet')}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
        >
          화장대에서 분석하기
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

  // 제안이 없는 이유가 셋이고, 사용자가 할 수 있는 일이 서로 다르다.
  if (!suggestion) {
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

    // 더 싼 것이 같은 제품의 다른 용량뿐이다. 교체 제안은 아니지만
    // "대용량이 단가가 싸다"는 그 자체로 쓸모가 있어 숨기지 않는다.
    if (outcome === 'variantOnly' && variantHint) {
      const { seed: vSeed, alt: vAlt } = variantHint;
      return (
        <SectionFrame count={0}>
          <p className="text-[13px] leading-relaxed text-oy-text">
            성분이 다른 대체품 중에는 더 나은 게 없었어요.
            <br />
            <span className="text-oy-sub">대신 같은 제품의 다른 용량이 더 쌉니다.</span>
          </p>
          <button
            type="button"
            onClick={() => navigate(`/detail/${vAlt.id}`)}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-oy-line p-3 text-left transition-transform active:scale-[.98]"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-oy-line">
              {vAlt.imageUrl && (
                <img src={vAlt.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-bold text-oy-sub">{vSeed.name}</p>
              <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-oy-text">
                {vAlt.name}
              </p>
              <p className="mt-0.5 text-[12px] font-extrabold text-oy-text">
                {vAlt.price.toLocaleString()}원{' '}
                <span className="text-accent">
                  −{(-(vAlt.priceDelta ?? 0)).toLocaleString()}
                </span>
              </p>
            </div>
          </button>
        </SectionFrame>
      );
    }

    // 후보는 봤지만 전부 더 비싸거나 성분이 덜 비슷했다. 진짜 "없음"이다.
    return (
      <SectionFrame count={0}>
        <p className="text-[13px] leading-relaxed text-oy-sub">
          지금 쓰는 제품보다 나은 대체품을 못 찾았어요.
          <br />
          <span className="font-semibold text-oy-text">잘 고르셨네요.</span>
        </p>
      </SectionFrame>
    );
  }

  const { seed, alt } = suggestion;
  const saving = -(alt.priceDelta ?? 0);
  const shared = alt.sharedKeyIngredients?.slice(0, 3) ?? [];

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

  return (
    <SectionFrame count={1}>
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
        <div className="flex w-16 shrink-0 flex-col items-center gap-1 pt-[28%]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light text-[15px] font-bold text-primary">
            →
          </span>
          <span className="text-[10px] font-bold text-primary">
            유사도 {alt.similarityScore}%
          </span>
        </div>

        <SwapProduct
          imageUrl={alt.imageUrl}
          chipLabel="대체품"
          chipTone="alt"
          brand={alt.brand}
          name={alt.name}
          onClick={() => navigate(`/detail/${alt.id}`)}
        >
          <p className="mt-0.5 text-[12px] font-extrabold text-oy-text">
            {alt.price.toLocaleString()}원{' '}
            <span className="text-accent">−{saving.toLocaleString()}</span>
          </p>
        </SwapProduct>
      </div>

      {shared.length > 0 && (
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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => navigate(`/alternatives?seed=${seed.id}&from=home`)}
          className="flex-1 rounded-xl border border-oy-line bg-white py-3 text-[13px] font-bold text-oy-text transition-transform active:scale-[.98]"
        >
          성분 비교
        </button>
        <button
          type="button"
          onClick={addAltToCart}
          className="flex-[1.6] rounded-xl bg-primary py-3 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
        >
          장바구니에 담기
        </button>
      </div>
    </SectionFrame>
  );
}
