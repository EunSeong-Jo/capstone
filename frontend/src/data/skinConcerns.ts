/**
 * 얼굴 사진 분석 항목의 화면용 이름.
 *
 * 키는 서버가 내려주는 분석 항목 이름(`/api/v1/skin-analysis`의 `concerns[].key`)이다.
 * 점수는 0~100이고 **높을수록 좋다**(업체 기준) — 막대가 길수록 그 항목이 건강하다.
 */
export interface ConcernMeta {
  label: string;
  /** 무엇을 보는 항목인지 (분석 업체 문서의 정의를 풀어 쓴 것) */
  desc: string;
  /** 점수가 낮을 때 보여 줄 짧은 해석 */
  low: string;
}

export const CONCERN_META: Record<string, ConcernMeta> = {
  oiliness: { label: '유분', desc: '피부 번들거림(유분) 정도를 봐요.', low: '번들거림이 있어요' },
  moisture: { label: '수분', desc: '피부가 머금은 수분(보습) 정도를 봐요.', low: '수분이 부족해요' },
  redness: { label: '홍조', desc: '피부의 붉은기 정도를 봐요.', low: '붉은기가 있어요' },
  age_spot: { label: '잡티·색소', desc: '잡티와 색소 침착이 있는지 봐요.', low: '잡티가 보여요' },
  acne: { label: '트러블', desc: '여드름 같은 트러블이 있는지 봐요.', low: '트러블이 있어요' },
  pore: { label: '모공', desc: '모공이 얼마나 눈에 띄는지 봐요.', low: '모공이 눈에 띄어요' },
  wrinkle: { label: '주름', desc: '얼굴 전반의 주름 정도를 봐요.', low: '주름이 보여요' },
  firmness: { label: '탄력', desc: '피부 탄력(처지지 않고 탱탱한 정도)을 봐요.', low: '탄력이 떨어져 있어요' },
  radiance: { label: '광채', desc: '피부가 얼마나 밝고 윤기 있어 보이는지 봐요.', low: '칙칙해 보여요' },
  texture: { label: '피부결', desc: '피부결(전반적인 매끄러움)을 봐요.', low: '피부결이 거칠어요' },
  dark_circle_v2: { label: '다크서클', desc: '눈 밑 다크서클이 있는지 봐요.', low: '다크서클이 있어요' },
  eye_bag: { label: '눈밑 불룩', desc: '눈 밑이 불룩한 정도(눈밑 지방)를 봐요.', low: '눈밑이 불룩해 보여요' },
  droopy_upper_eyelid: { label: '윗눈꺼풀 처짐', desc: '윗눈꺼풀이 처진 정도를 봐요.', low: '윗눈꺼풀이 처져 있어요' },
  droopy_lower_eyelid: { label: '아랫눈꺼풀 처짐', desc: '아랫눈꺼풀이 처진 정도를 봐요.', low: '아랫눈꺼풀이 처져 있어요' },
  tear_trough: { label: '눈밑 꺼짐', desc: '눈 밑 눈물고랑(꺼진 골)이 있는지 봐요.', low: '눈밑이 꺼져 보여요' },
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
  'eye_bag',
  'droopy_upper_eyelid',
  'droopy_lower_eyelid',
  'tear_trough',
];

/** 구독자 확장 항목 — 무료 사용자에게는 이 자리가 구독 안내로 보인다 */
export const EXTENDED_ONLY = [
  'firmness',
  'radiance',
  'texture',
  'dark_circle_v2',
  'eye_bag',
  'droopy_upper_eyelid',
  'droopy_lower_eyelid',
  'tear_trough',
];

/** 구독자가 받는 분석 항목 수(피부 분류 포함). 서버 `EXTENDED_CONCERNS`와 같아야 한다 */
export const EXTENDED_TOTAL = 16;

/** 업체의 피부 분류 → 한국어 */
export const SKIN_TYPE_LABEL: Record<string, string> = {
  Normal: '중성',
  Oily: '지성',
  Dry: '건성',
  Combination: '복합성',
  Redness: '붉은기',
  'Dry & Redness': '건성 + 붉은기',
  'Oily & Redness': '지성 + 붉은기',
  'Combination & Redness': '복합성 + 붉은기',
};
