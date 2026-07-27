import {
  WeatherInfo,
  WeatherCondition,
  SkinType,
  SkinCareTipMap,
  CharacterState,
  RegistrySummary,
  ProfileUser,
  QuickAction,
} from '../types';

// 홈 메인 대시보드 목업 데이터 (날씨 · 캐릭터 · 등록물품 · ID 카드)
// TODO: 사용자 store/API 연동 시 교체

const img = (seed: string, s = 80) => `https://picsum.photos/seed/${seed}/${s}/${s}`;

// ===== 날씨 =====
export const MOCK_WEATHER: WeatherInfo = {
  condition: 'sunny',
  conditionLabel: '맑음',
  temperature: 27,
  season: 'summer',
  seasonLabel: '초여름',
  humidity: 62,
};

/** 날씨 condition → 배경 그라데이션 + 아이콘 (WeatherBanner 시각) */
export const WEATHER_VISUAL: Record<WeatherCondition, { gradient: string; emoji: string }> = {
  sunny: { gradient: 'from-amber-200 via-orange-100 to-sky-200', emoji: '☀️' },
  cloudy: { gradient: 'from-slate-200 to-slate-300', emoji: '☁️' },
  rainy: { gradient: 'from-sky-300 to-indigo-200', emoji: '🌧️' },
  snowy: { gradient: 'from-sky-100 to-slate-200', emoji: '❄️' },
  windy: { gradient: 'from-teal-100 to-emerald-200', emoji: '🌬️' },
};

// ===== 피부타입 × 날씨 맞춤 케어 메시지 =====
export const SKIN_CARE_TIPS: SkinCareTipMap = {
  ondalsam: {
    sunny: '수분 밸런스가 좋아요. 가벼운 자외선 차단만 챙기면 완벽해요 ☀️',
    cloudy: '오늘은 산뜻한 기본 보습으로 충분해요',
    rainy: '습한 날엔 산뜻한 젤 타입 보습으로!',
  },
  mulgae: {
    sunny: '유분 폭발 주의! 산뜻한 무기자차 + 블로팅지 챙기세요',
    cloudy: '피지 관리 토너로 번들거림 잡기',
    rainy: '습도 높은 날, 가벼운 수분젤로 산뜻하게',
  },
  subuji: {
    sunny: '겉은 산뜻·속은 촉촉! 수분 세럼 한 겹 추가하세요',
    cloudy: '속건조 케어 잊지 마세요',
    rainy: 'T존은 산뜻하게, 볼은 촉촉하게 이중 케어',
  },
  hwasan: {
    sunny: '진정 토너로 열감 가라앉히고 저자극 선크림 필수',
    cloudy: '트러블 진정에 집중하는 하루',
    rainy: '습한 날 모공 관리, 저자극 클렌징으로',
  },
  samak: {
    sunny: '강한 보습 크림 필수! 미스트 휴대 추천',
    cloudy: '오일 한 방울로 보습막을 만들어 주세요',
    snowy: '극건조 경보! 오일로 마무리 보습',
  },
  injeolmi: {
    sunny: '탄력은 좋아요. 보습 + 자차로 마무리하세요',
    cloudy: '수분 크림 한 겹으로 촉촉함 유지',
    rainy: '가벼운 보습으로도 충분한 하루',
  },
  yuriguseul: {
    sunny: '저자극 무기자차, 새 제품은 꼭 패치테스트 먼저!',
    cloudy: '자극 적은 진정 케어 위주로',
    rainy: '민감해지기 쉬운 날, 최소한의 단계로',
  },
  memilmuk: {
    sunny: '미백·잡티엔 자외선 차단이 핵심! SPF50+ 필수',
    cloudy: '비타민C 세럼으로 잡티 관리',
    rainy: '꾸준한 톤케어가 답! 미백 세럼 잊지 마세요',
  },
};

/** 피부타입 × 날씨 케어 메시지 조회 (조합 없으면 폴백 체인) */
export function getSkinCareTip(skinType: SkinType, condition: WeatherCondition): string {
  const byType = SKIN_CARE_TIPS[skinType] ?? {};
  return (
    byType[condition] ??
    Object.values(byType)[0] ??
    '오늘도 기본 보습과 자외선 차단 잊지 마세요!'
  );
}

// ===== 내 캐릭터 (마스코트 / 경험치) =====
export const MOCK_CHARACTER: CharacterState = {
  skinType: 'ondalsam',
  expression: 'neutral',
  level: 4,
  exp: 320,
  nextLevelExp: 500,
  title: '꼼꼼 분석가',
};

// ===== 등록물품 =====
export const MOCK_REGISTRY: RegistrySummary = {
  count: 12,
  totalSavings: 74500,
  recent: [
    { id: 1, name: '아토베리어365 크림', brand: '에스트라', category: '크림', imageUrl: img('reg1') },
    { id: 2, name: '하이드라비오 토너', brand: '바이오더마', category: '토너', imageUrl: img('reg2') },
    { id: 3, name: '시카플라스트 밤', brand: '라로슈포제', category: '밤', imageUrl: img('reg3') },
  ],
};

// ===== ID 카드 프로필 =====
export const MOCK_PROFILE: ProfileUser = {
  nickname: '대체러',
  skinType: 'ondalsam',
  memberSince: '2026.03',
  idNo: '960101-OY1****',
};

// ===== ID 카드 편의기능 바로가기 =====
export const PROFILE_QUICK_ACTIONS: QuickAction[] = [
  { id: 'analysis', label: '성분 분석', icon: '🔬', path: '/search' },
  { id: 'history', label: '분석 기록', icon: '📑', path: '/history' },
  { id: 'mypage', label: '내 정보', icon: '👤', path: '/mypage' },
];
