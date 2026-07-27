// 내 화장대(4c) — 보유 제품 상태 관리 목업
// TODO: 실제 등록물품/분석 API 연동 전까지 목데이터

const img = (seed: string, s = 108) => `https://picsum.photos/seed/${seed}/${s}/${s}`;

/** 제품 상태: 교체 제안 / 단종 주의 / 스캔 완료 / 분석 대기 */
export type VanityStatus = 'replace' | 'discontinue' | 'scanned' | 'pending';

export interface VanityItem {
  id: number; // 대체품/상세 이동용 seedId
  brand: string;
  name: string;
  imageUrl: string;
  status: VanityStatus;
  statusLabel: string; // "교체 제안 도착 · 유사도 92%"
  badge: string; // 우측 액션 뱃지 문구
  to: string; // 클릭 시 이동 경로
}

export const VANITY_ITEMS: VanityItem[] = [
  { id: 1, brand: '이니스프리', name: '수분 밸런싱 토너 200ml', imageUrl: img('seed1'), status: 'replace', statusLabel: '교체 제안 도착 · 유사도 92%', badge: '−10,000원', to: '/alternatives?seed=1&from=closet' },
  { id: 6, brand: '에스트라', name: '아토베리어365 크림 80ml', imageUrl: img('seed6'), status: 'discontinue', statusLabel: '단종 예정 · 대체품 2개 준비됨', badge: '대비 필요', to: '/alternatives?seed=6&from=closet' },
  { id: 8, brand: '라로슈포제', name: '시카플라스트 밤 B5+ 40ml', imageUrl: img('seed8'), status: 'scanned', statusLabel: '어제 스캔 · 주의 성분 2개', badge: '분석 보기', to: '/alternatives?seed=8&from=closet' },
  { id: 5, brand: '바이오더마', name: '하이드라비오 토너 250ml', imageUrl: img('seed5'), status: 'pending', statusLabel: '분석 대기 중', badge: '분석하기', to: '/scan' },
  { id: 11, brand: '라운드랩', name: '자작나무 수분 크림 80ml', imageUrl: img('seed11'), status: 'replace', statusLabel: '교체 제안 도착 · 유사도 88%', badge: '−6,500원', to: '/alternatives?seed=11&from=closet' },
  { id: 12, brand: '토리든', name: '다이브인 저분자 히알루론산 세럼', imageUrl: img('seed12'), status: 'pending', statusLabel: '분석 대기 중', badge: '분석하기', to: '/scan' },
];

/** 상단 필터 칩 정의 (전체 + 상태별) */
export const VANITY_FILTERS: { key: 'all' | VanityStatus; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'replace', label: '교체 제안' },
  { key: 'pending', label: '분석 대기' },
  { key: 'discontinue', label: '단종 주의' },
];
