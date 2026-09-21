/**
 * OCR 인식 결과 픽스처 (Task 4 대체).
 *
 * Tesseract/EasyOCR 연동 전까지, 성분표 촬영 시 "인식된 것처럼" 보여줄 준비된 결과다.
 * Scan 화면이 촬영 버튼을 누를 때마다 목록을 순환하며 하나씩 반환한다.
 *
 * id·이름·가격·전성분은 **실제 카탈로그 제품**이다. 예전에는 촬영 시각으로
 * 임시 id를 만들었는데(`950000 + Date.now()%100000`), 그러면 화장대에서
 * 대체품을 열 때 `/similar`가 404를 낸다 — 인식은 됐는데 추천이 안 나오는
 * 셈이라 시연에서 가장 먼저 눈에 띄는 구멍이었다. 같은 제품을 두 번 스캔해도
 * 같은 id가 나오므로 화장대 중복 등록도 함께 막힌다.
 */

export interface OcrResult {
  /** 실제 카탈로그 제품 id. /similar가 이 값을 그대로 받는다 */
  id: number;
  brand: string;
  name: string;
  category: string;
  price: number;
  /** 인식된 전성분 (함량 많은 순) */
  ingredients: string[];
  safeCount: number;
  cautionCount: number;
}

export const OCR_FIXTURES: OcrResult[] = [
  {
    id: 216,
    brand: '토리든',
    name: '다이브인 저분자 히알루론산 세럼 50ml',
    category: '스킨케어',
    price: 22000,
    ingredients: [
      '정제수', '부틸렌글라이콜', '글리세린', '다이프로필렌글라이콜', '1,2-헥산다이올', '판테놀',
      '소듐하이알루로네이트크로스폴리머', '하이드롤라이즈드하이알루로닉애씨드', '소듐하이알루로네이트', '소듐아세틸레이티드하이알루로네이트', '하이드롤라이즈드소듐하이알루로네이트',
    ],
    safeCount: 10,
    cautionCount: 1,
  },
  {
    id: 11,
    brand: '아누아',
    name: '어성초 77 히알루론산 수분 진정 토너 350ml',
    category: '스킨케어',
    price: 22800,
    ingredients: [
      '약모밀꽃/잎/줄기수', '정제수', '1,2-헥산다이올', '글리세린', '글리세레스-26', '베타인',
      '펜틸렌글라이콜', '소듐시트레이트', '아이소펜틸다이올', '에틸헥실글리세린', '다이포타슘글리시리제이트',
    ],
    safeCount: 9,
    cautionCount: 2,
  },
  {
    id: 1722,
    brand: '라운드랩',
    name: '1025 독도 토너 200ml',
    category: '스킨케어',
    price: 13500,
    ingredients: [
      '정제수', '부틸렌글라이콜', '글리세린', '펜틸렌글라이콜', '프로판다이올', '아이리쉬모스추출물',
      '사탕수수추출물', '해수', '1,2-헥산다이올', '프로테아제', '베타인',
    ],
    safeCount: 9,
    cautionCount: 1,
  },
  {
    id: 712,
    brand: '에스트라',
    name: '아토베리어365 크림 80ml',
    category: '스킨케어',
    price: 29700,
    ingredients: [
      '정제수', '부틸렌글라이콜', '글리세린', '부틸렌글라이콜다이카프릴레이트/다이카프레이트', '세틸에틸헥사노에이트', '스쿠알란',
      '펜타에리스리틸테트라아이소스테아레이트', '다이카프릴릴카보네이트', '베헤닐알코올', '다이메티콘', '하이드록시프로필비스팔미타마이드엠이에이',
    ],
    safeCount: 9,
    cautionCount: 1,
  },
];

/** 순환 인덱스로 다음 결과를 돌려준다. */
export function nextOcrResult(seq: number): OcrResult {
  return OCR_FIXTURES[seq % OCR_FIXTURES.length];
}
