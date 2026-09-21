/** 대체품 파생 — 서버 응답을 화면 모양으로 옮긴다.
 *
 * `/similar`가 내는 것은 `score`·`sharedIngredients` 세 가지뿐이고, 화면의
 * `Alternative`는 백분율·절약액·이유 태그를 기대한다. 그 간극을 여기서만
 * 메운다. 유사도 계산 로직이 바뀌어도 고칠 파일이 이 하나가 되도록,
 * **백분율 변환과 뱃지 임계가 저장소에서 여기에만 있다.**
 *
 * 훅이 아니라 순수 함수로 둔 이유는 대체품 화면과 상품상세가 같은 파생을
 * 쓰기 때문이고, 테스트 러너가 없는 지금 눈으로 검증 가능한 단위가
 * 순수 함수이기 때문이다.
 */
import { SimilarItem } from '../api/similar';
import { AltReasonTag, Alternative, Product } from '../types';

/** 절약액·절약률 계산에 필요한 기준제품의 최소 형태. */
export type SeedRef = Pick<Product, 'id' | 'price'> & { brand?: string; name?: string };

/**
 * 뱃지를 초록(sim-high)으로 올릴 기준, 백분율.
 *
 * 카드의 원래 값은 80이었는데 목업 점수(92·88)에 맞춘 숫자였다. 실측
 * 분포는 전혀 다르다 — 제품 100개를 훑으면 전체 항목의 중앙값이 0.197이고
 * 0.8 이상은 3.2%뿐이라, 80을 두면 사실상 아무 카드도 초록이 되지 않는다.
 * 전부 주황(warning)이면 "다 별로"로 읽힌다.
 *
 * 분포가 쌍봉이다. 꼬리가 11~25%에 몰리고 상위가 60~100%로 떨어져 있어
 * 중간대가 얇다. 30은 그 골짜기에 있고, 시드당 20개 중 3~5개가 초록이 된다.
 * 최고점이 25%뿐인 제품은 초록이 하나도 없는데, 실제로 그만큼 안 비슷하다.
 *
 * method를 바꾸면(rbo는 점수가 전반적으로 높다) 이 값도 다시 잡아야 한다.
 */
export const SIMILARITY_HIGH = 30;

/**
 * 같은 제품으로 볼 점수, 백분율.
 *
 * 적재 배치(scripts/compute_similarities.py)의 DUPLICATE_THRESHOLD와 같은
 * 개념이다. 성분 구성이 이 정도로 같으면 같은 제품이거나 용량만 다른 변형이다.
 */
const SAME_PRODUCT_MIN = 99;

/**
 * 제품명 말미의 용량 표기. '토너 250ml' → '토너'
 *
 * 괄호 안 용량('(500ml/250ml)')과 '1매/10매' 같은 중간 표기는 일부러 건드리지
 * 않는다. 그런 이름은 애초에 한 항목이 여러 용량을 가리키는 경우라,
 * 떼어내면 서로 다른 제품이 같은 몸통을 갖게 된다.
 */
const VOLUME_SUFFIX = /[\s(]*\d+(?:\.\d+)?\s*(?:ml|mL|ML|g|G|매|ea|EA|개|정)\)?\s*$/;

/** 용량과 공백을 뗀 제품명. 같은 제품의 다른 용량을 맞춰 보는 데 쓴다. */
function nameBody(name: string): string {
  return name.replace(VOLUME_SUFFIX, '').replace(/\s+/g, '');
}

/**
 * 0~1 점수를 백분율로. **저장소에서 이 변환이 일어나는 유일한 지점.**
 *
 * 서버 계약은 0 < score <= 1이지만, 계산식이 바뀌면 벗어날 수 있어 잘라둔다.
 */
export function toSimilarityPercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}

/** 카드 우상단 뱃지 색. 두 카드 컴포넌트가 이 함수를 공유한다. */
export function similarityBadgeType(percent: number): 'sim-high' | 'sim-mid' {
  return percent >= SIMILARITY_HIGH ? 'sim-high' : 'sim-mid';
}

/**
 * 서버 항목 하나를 카드가 읽는 모양으로.
 *
 * seed가 null일 수 있다. 기준제품은 `/similar`가 아니라 별도 요청으로
 * 오기 때문에 목록보다 늦게 도착한다. 그동안 가격 파생을 전부 생략한다 —
 * 기준가를 모르는 채 절약액을 0으로 채우면 "0원 절약"을 그리게 된다.
 */
export function toAlternative(item: SimilarItem, seed: SeedRef | null): Alternative {
  const similarityScore = toSimilarityPercent(item.score);

  // 음수가 절약이다. AlternativeCard가 priceDelta < 0으로 판정하므로 부호를 맞춘다.
  const priceDelta = seed ? item.price - seed.price : undefined;
  const savingRate =
    priceDelta !== undefined && priceDelta < 0 && seed && seed.price > 0
      ? Math.round((-priceDelta / seed.price) * 100)
      : undefined;

  // 서버가 주는 것으로 정직하게 만들 수 있는 태그만 넣는다.
  //   skinMatch  profiles·skin_type_rules 연동 전이라 판단 근거가 없다 (Task 13·14)
  //   situation  단종·품절 정보를 수집하지 않는다
  //   similarity 우상단 뱃지와 중복이고 ReasonTags가 기본으로 걸러낸다
  // 그래서 대부분의 카드는 태그가 0~1개다. 목업보다 허전한 게 정상이다.
  const reasonTags: AltReasonTag[] = [];
  if (savingRate !== undefined && savingRate >= 10) {
    reasonTags.push({ type: 'priceSave', label: `${savingRate}% 저렴` });
  }

  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    category: item.category,
    imageUrl: item.imageUrl,
    price: item.price,
    rating: item.rating,
    reviewCount: item.reviewCount,
    unitPrice: item.unitPrice,
    unitLabel: item.unitLabel,
    similarityScore,
    seedId: seed?.id,
    priceDelta,
    savingRate,
    situation: null,
    reasonTags,
    sharedKeyIngredients: item.sharedIngredients,
  };
}

/**
 * '같은 제품의 다른 용량'을 갈라낸다.
 *
 * 배치가 이것들을 걸러내지 않아서, 실측으로 제품 100개를 훑으면 1순위
 * 점수의 중앙값이 1.000이다. 절반 이상에서 "유사도 100%" 1등이 사실은
 * 같은 제품이다 — 브링그린 프레시 마스크 1매(1,800원) 옆에 1매/10매
 * (8,000원)가 서는 식이다. 대체품이라고 부를 수 없다.
 *
 * 그렇다고 버리지는 않는다. 카드가 이미 단가를 그리므로 "대용량이 단가가
 * 싸다"는 비교로는 쓸모가 있다. 그래서 숨기지 않고 따로 묶어 보여준다.
 *
 * 브랜드까지 같은지 보는 이유: 성분이 똑같은 **다른 브랜드** 제품은 오히려
 * 가장 좋은 대체품이다(OEM이 같은 경우가 그렇다). 그건 목록에 남겨야 한다.
 *
 * 기준제품이 아직 없으면 판정을 건너뛴다. 배치가 variant를 제외하게 되면
 * 이 함수는 통째로 사라진다.
 */
export function splitSameProductVariants(
  seed: SeedRef | null,
  items: Alternative[],
): { variants: Alternative[]; alternatives: Alternative[] } {
  if (!seed?.brand) return { variants: [], alternatives: items };

  const seedBody = seed.name ? nameBody(seed.name) : null;

  const variants: Alternative[] = [];
  const alternatives: Alternative[] = [];
  for (const item of items) {
    // 판정이 둘인 이유는 두 종류의 '같은 제품'이 있기 때문이다.
    //   점수  성분 구성이 완전히 같다 — 이름이 달라도 잡힌다
    //         (브링그린 프레시 마스크 '1매' ↔ '1매/10매')
    //   이름  용량만 다른 같은 제품인데 성분표 표기가 조금 달라 점수가
    //         86% 정도로 떨어지는 경우 (바이오더마 하이드라비오 토너 250 ↔ 500)
    // 둘 다 같은 브랜드를 전제로 한다. 성분이 같은 **다른 브랜드** 제품은
    // 오히려 가장 좋은 대체품이라 목록에 남겨야 한다.
    const sameBrand = item.brand === seed.brand;
    const sameProduct =
      sameBrand &&
      (item.similarityScore >= SAME_PRODUCT_MIN ||
        (seedBody !== null && nameBody(item.name) === seedBody));
    (sameProduct ? variants : alternatives).push(item);
  }
  return { variants, alternatives };
}
