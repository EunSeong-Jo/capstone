export type SkinType =
  | 'ondalsam'
  | 'mulgae'
  | 'subuji'
  | 'hwasan'
  | 'samak'
  | 'injeolmi'
  | 'yuriguseul'
  | 'memilmuk';

export const SKIN_TYPE_META: Record<SkinType, { label: string; emoji: string; summary: string }> = {
  ondalsam:    { label: '수분팡팡 옹달샘', emoji: '💧', summary: '수분·유분 균형, 이상적 피부' },
  mulgae:      { label: '반질반질 물개',   emoji: '🦭', summary: '지성, 번들거림, 모공' },
  subuji:      { label: '겉바속촉 수부지', emoji: '🌊', summary: '속건조 + 겉번들' },
  hwasan:      { label: '울긋불긋 화산',   emoji: '🌋', summary: '트러블·홍조·염증' },
  samak:       { label: '바스락 사막',     emoji: '🏜️', summary: '극건성, 당김' },
  injeolmi:    { label: '말랑말랑 인절미', emoji: '🍡', summary: '건성·탄력 양호' },
  yuriguseul:  { label: '조심조심 유리구슬', emoji: '🫧', summary: '민감성, 자극 반응' },
  memilmuk:    { label: '얼룩덜룩 메밀묵', emoji: '🌑', summary: '색소침착·잡티' },
};

export interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  imageUrl?: string;
  price: number;
  originalPrice?: number;
  discountRate?: number;
  rating?: number;
  reviewCount?: number;
  isNew?: boolean;
  isBest?: boolean;
  /** 올리브영식 태그칩 (예: '오늘드림', 'BEST', '쿠폰', '증정', '오특') */
  tags?: string[];
  /** 누적 구매 횟수 (자주 구매 목록에서 사용) */
  purchaseCount?: number;
}

// ===== 성분 =====
export type IngredientGrade = 'key' | 'normal' | 'warn'; // 주요 / 일반 / 주의

export interface Ingredient {
  id: number;
  name: string; // '히알루론산'
  /**
   * 성분 등급. 아직 큐레이션 전이라 API가 주지 않습니다.
   * DB(ingredients.grade)가 전부 NULL이며, 상위 200종이 전체 출현의
   * 58%를 덮으므로 그 범위부터 채울 예정입니다.
   */
  grade?: IngredientGrade;
  ewg?: number; // EWG 등급(선택). grade와 같은 이유로 아직 비어 있습니다
  /** 피부타입별 궁합 (good=잘 맞음, caution=주의) */
  skinAffinity?: Partial<Record<SkinType, 'good' | 'caution'>>;
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
  priceDelta?: number; // 기준 대비 가격차 (음수=절약)
  savingRate?: number; // 절약률 % (양수)
  skinMatch?: { skinType: SkinType; verdict: 'good' | 'caution' };
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
  skinType: SkinType; // 캐릭터가 대표하는 피부타입
  expression: FaceExpression; // 사용 표정 (현재 'neutral' 고정)
  level: number; // 현재 레벨
  exp: number; // 현재 레벨 내 누적 경험치
  nextLevelExp: number; // 다음 레벨까지 필요한 경험치 (분모)
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
  totalSavings: number; // 대체품으로 이번 달 절약 가능 금액(원)
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
  skinType: SkinType;
  memberSince?: string; // 발급일 컨셉 "2026.03"
  idNo?: string; // 더미 식별번호 "960101-OY1****"
}
