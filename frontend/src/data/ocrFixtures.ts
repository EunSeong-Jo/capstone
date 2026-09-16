/**
 * OCR 인식 결과 픽스처 (Task 4 대체).
 *
 * Tesseract/EasyOCR 연동 전까지, 성분표 촬영 시 "인식된 것처럼" 보여줄 준비된 결과다.
 * Scan 화면이 촬영 버튼을 누를 때마다 목록을 순환하며 하나씩 반환한다.
 */

export interface OcrResult {
  /** 화장대/대체품에서 쓸 임시 제품 id (실제 제품 id 범위 밖) */
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

export const OCR_FIXTURES: Omit<OcrResult, 'id'>[] = [
  {
    brand: '토리든',
    name: '다이브인 저분자 히알루론산 세럼 50ml',
    category: '스킨케어',
    price: 22000,
    ingredients: [
      '정제수', '부틸렌글라이콜', '글리세린', '1,2-헥산다이올', '소듐하이알루로네이트',
      '베타글루칸', '판테놀', '알란토인', '카보머', '트로메타민', '다이소듐이디티에이',
    ],
    safeCount: 10,
    cautionCount: 1,
  },
  {
    brand: '아누아',
    name: '어성초 77 수딩 토너 250ml',
    category: '스킨케어',
    price: 21000,
    ingredients: [
      '어성초추출물', '정제수', '부틸렌글라이콜', '나이아신아마이드', '1,2-헥산다이올',
      '글리세린', '판테놀', '알지닌', '카보머', '알란토인', '향료',
    ],
    safeCount: 9,
    cautionCount: 2,
  },
  {
    brand: '라운드랩',
    name: '1025 독도 토너 200ml',
    category: '스킨케어',
    price: 19000,
    ingredients: [
      '정제수', '다이프로필렌글라이콜', '글리세린', '베타인', '판테놀',
      '알로에베라잎추출물', '해수', '소듐하이알루로네이트', '알란토인', '다이소듐이디티에이',
    ],
    safeCount: 10,
    cautionCount: 0,
  },
  {
    brand: '에스트라',
    name: '아토베리어365 크림 80ml',
    category: '스킨케어',
    price: 33000,
    ingredients: [
      '정제수', '글리세린', '카프릴릭/카프릭트라이글리세라이드', '나이아신아마이드',
      '세테아릴알코올', '판테놀', '세라마이드엔피', '마데카소사이드', '스쿠알란', '카보머',
    ],
    safeCount: 9,
    cautionCount: 1,
  },
];

/** 순환 인덱스로 다음 결과를 만든다 (id는 촬영 시각으로 고유화) */
export function nextOcrResult(seq: number): OcrResult {
  const base = OCR_FIXTURES[seq % OCR_FIXTURES.length];
  return { ...base, id: 950000 + (Date.now() % 100000) };
}
