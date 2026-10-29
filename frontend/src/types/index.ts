export type SkinType =
  | 'ondalsam'
  | 'mulgae'
  | 'subuji'
  | 'hwasan'
  | 'samak'
  | 'injeolmi'
  | 'yuriguseul'
  | 'memilmuk';

export const SKIN_TYPE_META: Record<
  SkinType,
  // category는 별명을 모르는 사람에게 보여줄 일반 명칭이다 — '반질반질 물개'만
  // 적으면 그게 지성인지 건성인지 알 수 없다.
  { label: string; emoji: string; summary: string; category: string }
> = {
  ondalsam:    { label: '수분팡팡 옹달샘', emoji: '💧', summary: '수분·유분 균형, 이상적 피부', category: '중성' },
  mulgae:      { label: '반질반질 물개',   emoji: '🦭', summary: '지성, 번들거림, 모공', category: '지성' },
  subuji:      { label: '겉바속촉 수부지', emoji: '🌊', summary: '속건조 + 겉번들', category: '수부지' },
  hwasan:      { label: '울긋불긋 화산',   emoji: '🌋', summary: '트러블·홍조·염증', category: '트러블' },
  samak:       { label: '바스락 사막',     emoji: '🏜️', summary: '극건성, 당김', category: '악건성' },
  injeolmi:    { label: '말랑말랑 인절미', emoji: '🍡', summary: '건성·탄력 저하, 주름', category: '탄력저하' },
  yuriguseul:  { label: '조심조심 유리구슬', emoji: '🫧', summary: '민감성, 자극 반응', category: '민감성' },
  memilmuk:    { label: '얼룩덜룩 메밀묵', emoji: '🌑', summary: '색소침착·잡티', category: '색소침착' },
};

/**
 * 아직 진단하지 않았을 때의 표시값.
 *
 * `SkinType`에 9번째 코드를 넣지 않는다. 8종은 DB(`skin_type_rules` 8행)와
 * 백엔드 검증(`api/me.py: SKIN_TYPES`)이 함께 쓰는 집합이라, 여기에 'guest'를
 * 끼우면 `PATCH /me/profile`이 **진단이 아닌 값을 프로필에 저장**할 수 있게
 * 된다. 이건 화면에서만 쓰는 상태다.
 */
export const UNKNOWN_SKIN_META = {
  label: '피부타입 미정',
  emoji: '🤔',
  category: '진단 전',
} as const;

export interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  imageUrl?: string;
  price: number;
  originalPrice?: number;
  discountRate?: number;
  rating?: number | null;
  reviewCount?: number;
  isNew?: boolean;
  isBest?: boolean;
  /** 올리브영식 태그칩 (예: '오늘드림', 'BEST', '쿠폰', '증정', '오특') */
  tags?: string[];
  /** 누적 구매 횟수 (자주 구매 목록에서 사용) */
  purchaseCount?: number;
  /** 단가와 그 기준. 둘은 항상 함께 오거나 함께 없다. 기준은 서버 코드
   *  (`sheet`·`ml10`·`g10`·`piece`)이고 문구는 lib/unitPrice.ts가 정한다. */
  unitPrice?: number | null;
  unitLabel?: string | null;
  /** 내 성분 취향과 겹칠 때만 서버가 채우는 추천 이유("내가 좋아한 ○○ 성분이 들어 있어요") */
  personalReason?: string | null;
}

// ===== 대체품 추천 =====
/** 추천 이유 4축 */
export type AltReasonType = 'skinMatch' | 'similarity' | 'priceSave' | 'situation';

export interface AltReasonTag {
  type: AltReasonType;
  label: string; // '옹달샘 궁합', '36% 저렴', '단종 대응'
  emphasis?: boolean; // 카드에서 강조할 대표 이유
}

/** 기준제품의 재고/단종 상황 */
export type AltSituation = 'discontinued' | 'soldout' | 'restock';

export interface Alternative extends Product {
  similarityScore: number; // 0~100 (성분 유사도)
  seedId?: number; // 기준제품 id
  basedOn?: string; // 어느 화장대 제품과 비슷해서 나왔는지(제품명) — 홈 '내 화장대와 비슷한 추천'
  priceDelta?: number; // 기준 대비 가격차 (음수=절약)
  savingRate?: number; // 절약률 % (양수)
  skinMatch?: { skinType: SkinType; verdict: 'good' | 'ok' | 'caution'; score?: number };
  situation?: AltSituation | null; // 상황 대응
  reasonTags?: AltReasonTag[]; // 카드 노출용 (직접 작성 or 파생)
  sharedKeyIngredients?: string[]; // 공통 주요성분 (유사도 근거)
}

export interface User {
  id: number;
  email: string;
  nickname?: string;
  skinType?: SkinType;
}

// ===== 홈 화면 (Digital Atelier) =====

export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface WeatherInfo {
  condition: WeatherCondition;
  conditionLabel: string; // "Sunny"
  /** OpenWeatherMap 아이콘 코드 (예: "01d"). https://openweathermap.org/img/wn/{icon}@2x.png */
  icon: string;
  temperature: number; // 25
  season: Season;
  seasonLabel: string; // "초여름"
  humidity?: number;
}

/** 홈 인기 카테고리 아이콘 가로스크롤용 (기존 string[] CATEGORIES와 별개) */
export interface HomeCategory {
  id: string;
  label: string; // "스킨케어"
  iconKey: string; // 아이콘/이모지 매핑 키
}

/** 피부타입 + 날씨 조합 → 오늘의 맞춤 케어 메시지 */
export type SkinCareTipMap = Record<SkinType, Partial<Record<WeatherCondition, string>>>;

// ===== 홈 메인 대시보드 (마스코트 · 경험치 · 등록물품 · ID 카드) =====

/** 마스코트 표정 (mascot/base_face_*.png 와 1:1 매핑) */
export type FaceExpression = 'neutral' | 'laugh' | 'thinking' | 'pout';

/** 내 캐릭터 상태 (레벨/경험치) */
export interface CharacterState {
  /** 캐릭터가 대표하는 피부타입. 모르면 null — 범용 얼굴을 그린다. */
  skinType: SkinType | null;
  expression: FaceExpression; // 사용 표정 (현재 'neutral' 고정)
  // 레벨·경험치는 GET /me/stats가 기록에서 계산해 준다(스캔·후기·주문·선물).
  // 비회원은 셀 대상이 서버에 없어 값이 비고, 그러면 대시보드가 그 줄을
  // 통째로 숨긴다 — 근거 없는 숫자를 그리지 않기 위해서다.
  level?: number;
  exp?: number;
  nextLevelExp?: number;
  title?: string; // "꼼꼼 분석가" 같은 칭호
}

/** 내가 등록한 보유 화장품 */
export interface RegistryItem {
  id: number;
  name: string;
  brand: string;
  category: string;
  imageUrl?: string;
}

/** ID 카드용 등록물품 요약 */
export interface RegistrySummary {
  count: number; // 등록물품 개수
  /**
   * 대체품으로 절약 가능한 금액(원). 화장대 제품들의 실제 유사도 조회
   * 결과에서 합산한다 — 고정값이 아니라 후보가 없으면 undefined다.
   */
  totalSavings?: number;
  recent?: RegistryItem[]; // 카드 썸네일용 (선택)
}

/** ID 카드 편의기능 바로가기 */
export interface QuickAction {
  id: string;
  label: string; // "성분 분석"
  icon: string; // 이모지
  path?: string; // 라우트 (없으면 placeholder)
}

/** "주민등록증" 컨셉 사용자 프로필 */
export interface ProfileUser {
  nickname: string;
  /** 진단 전이거나 아직 확인 중이면 null. 화면은 UNKNOWN_SKIN_META로 그린다. */
  skinType: SkinType | null;
  email?: string;
  memberSince?: string; // 발급일 컨셉 "2026.03"
}
