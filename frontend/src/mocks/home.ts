import { WeatherInfo, WeatherCondition, SkinType, SkinCareTipMap } from '../types';

/**
 * 날씨·케어문구의 **오프라인 폴백**.
 *
 * 제품 목업이 아니다. useWeather·useCareTip이 API 실패 시에만 쓰고,
 * 제품 id를 담지 않으므로 화면이 엉뚱한 상세로 이동할 위험이 없다.
 */

// ===== 날씨 =====
export const MOCK_WEATHER: WeatherInfo = {
  condition: 'sunny',
  conditionLabel: '맑음',
  icon: '01d', // OpenWeatherMap 맑은 낮 아이콘 코드
  temperature: 27,
  season: 'summer',
  seasonLabel: '초여름',
  humidity: 62,
};

// ===== 피부타입 × 날씨 맞춤 케어 메시지 =====
export const SKIN_CARE_TIPS: SkinCareTipMap = {
  ondalsam: {
    sunny: '수분 밸런스 굿! 자외선 차단만 챙겨요 ☀️',
    cloudy: '오늘은 산뜻한 기본 보습으로 충분해요',
    rainy: '습한 날엔 산뜻한 젤 타입 보습으로!',
  },
  mulgae: {
    sunny: '유분 주의! 무기자차와 블로팅지 챙겨요',
    cloudy: '피지 관리 토너로 번들거림 잡기',
    rainy: '습도 높은 날, 가벼운 수분젤로 산뜻하게',
  },
  subuji: {
    sunny: '겉은 산뜻·속은 촉촉! 수분 세럼 한 겹',
    cloudy: '속건조 케어 잊지 마세요',
    rainy: 'T존은 산뜻, 볼은 촉촉하게 이중 케어',
  },
  hwasan: {
    sunny: '진정 토너로 열감을, 저자극 선크림 필수',
    cloudy: '트러블 진정에 집중하는 하루',
    rainy: '습한 날 모공 관리, 저자극 클렌징으로',
  },
  samak: {
    sunny: '강한 보습 크림 필수! 미스트 휴대 추천',
    cloudy: '오일 한 방울로 보습막을 만들어요',
    snowy: '극건조 경보! 오일로 마무리 보습',
  },
  injeolmi: {
    sunny: '탄력은 좋아요. 보습 + 자차로 마무리하세요',
    cloudy: '수분 크림 한 겹으로 촉촉함 유지',
    rainy: '가벼운 보습으로도 충분한 하루',
  },
  yuriguseul: {
    sunny: '저자극 무기자차, 새 제품은 패치테스트!',
    cloudy: '자극 적은 진정 케어 위주로',
    rainy: '민감해지기 쉬운 날, 최소한의 단계로',
  },
  memilmuk: {
    sunny: '잡티엔 자외선 차단이 핵심! SPF50+',
    cloudy: '비타민C 세럼으로 잡티 관리',
    rainy: '꾸준한 톤케어가 답! 미백 세럼 챙겨요',
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