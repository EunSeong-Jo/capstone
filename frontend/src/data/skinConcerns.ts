/**
 * 얼굴 사진 분석 항목의 화면용 이름.
 *
 * 키는 서버가 내려주는 분석 항목 이름(`/api/v1/skin-analysis`의 `concerns[].key`)이다.
 * 점수는 0~100이고 **높을수록 좋다**(업체 기준) — 막대가 길수록 그 항목이 건강하다.
 */
export interface ConcernMeta {
  label: string;
  /** 점수가 낮을 때 보여 줄 짧은 해석 */
  low: string;
}

export const CONCERN_META: Record<string, ConcernMeta> = {
  oiliness: { label: '유분', low: '번들거림이 있어요' },
  moisture: { label: '수분', low: '수분이 부족해요' },
  redness: { label: '홍조', low: '붉은기가 있어요' },
  age_spot: { label: '잡티·색소', low: '잡티가 보여요' },
  acne: { label: '트러블', low: '트러블이 있어요' },
  pore: { label: '모공', low: '모공이 눈에 띄어요' },
  wrinkle: { label: '주름', low: '주름이 보여요' },
  firmness: { label: '탄력', low: '탄력이 떨어져 있어요' },
  radiance: { label: '광채', low: '칙칙해 보여요' },
  texture: { label: '피부결', low: '피부결이 거칠어요' },
  dark_circle_v2: { label: '다크서클', low: '다크서클이 있어요' },
};

/** 화면에 그리는 순서. 서버 응답 순서에 기대지 않는다 */
export const CONCERN_ORDER = [
  'oiliness',
  'moisture',
  'redness',
  'age_spot',
  'acne',
  'pore',
  'wrinkle',
  'firmness',
  'radiance',
  'texture',
  'dark_circle_v2',
];

/** 구독자 확장 항목 — 무료 사용자에게는 이 자리가 구독 안내로 보인다 */
export const EXTENDED_ONLY = ['firmness', 'radiance', 'texture', 'dark_circle_v2'];

/** 업체의 피부 분류 → 한국어 */
export const SKIN_TYPE_LABEL: Record<string, string> = {
  Normal: '보통',
  Oily: '지성',
  Dry: '건성',
  Combination: '복합성',
  Redness: '붉은기',
  'Dry & Redness': '건성 + 붉은기',
  'Oily & Redness': '지성 + 붉은기',
  'Combination & Redness': '복합성 + 붉은기',
};
