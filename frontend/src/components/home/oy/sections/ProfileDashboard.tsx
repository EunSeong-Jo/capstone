import { useNavigate } from 'react-router-dom';
import { CharacterState, ProfileUser, RegistrySummary, WeatherInfo, SKIN_TYPE_META } from '../../../../types';
import { WEATHER_VISUAL, getSkinCareTip } from '../../../../mocks/home';

/** 마스코트 표정 에셋 경로 (public/mascot/) */
const FACE_SRC: Record<CharacterState['expression'], string> = {
  neutral: '/mascot/base_face_neutral.png',
  laugh: '/mascot/base_face_laugh.png',
  thinking: '/mascot/base_face_thinking.png',
  pout: '/mascot/base_face_pout.png',
};

interface ProfileDashboardProps {
  weather: WeatherInfo;
  character: CharacterState;
  user: ProfileUser;
  registry: RegistrySummary;
}

/**
 * 홈 개인 대시보드 — 미니멀 뉴트럴.
 * 상단 미니 날씨바(계절·피부타입 칩) + 오늘의 케어 / 마스코트(탭→옷장)·프로필·경험치.
 * 카드 아래 '대체품 절약 가능' 그린 배너.
 */
export function ProfileDashboard({ weather, character, user, registry }: ProfileDashboardProps) {
  const navigate = useNavigate();
  const meta = SKIN_TYPE_META[user.skinType];
  const visual = WEATHER_VISUAL[weather.condition];
  const tip = getSkinCareTip(user.skinType, weather.condition);
  // "수분팡팡 옹달샘" → "옹달샘" (칩용 짧은 피부명)
  const skinWords = meta.label.split(' ');
  const shortSkinName = skinWords[skinWords.length - 1] || meta.label;
  const expPct = Math.min(100, Math.round((character.exp / character.nextLevelExp) * 100));

  return (
    <section className="px-4 pt-3 pb-4">
      <div className="rounded-[24px] bg-white border border-gray-10 shadow-soft p-5">
        {/* 상단 미니 날씨바 (조건·온도·습도·계절 + 피부타입 칩) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-100 min-w-0">
            <span className="text-lg leading-none">{visual.emoji}</span>
            <span>{weather.conditionLabel}</span>
            <span className="text-gray-20">·</span>
            <span>{weather.temperature}°</span>
            {weather.humidity != null && (
              <>
                <span className="text-gray-20">·</span>
                <span className="font-medium text-gray-50">습도 {weather.humidity}%</span>
              </>
            )}
            <span className="text-gray-20">·</span>
            <span className="font-medium text-gray-50 truncate">{weather.seasonLabel}</span>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-primary-light text-[11px] font-bold text-primary">
            {meta.emoji} {shortSkinName}
          </span>
        </div>
        {/* 마스코트(탭→옷장) + 오늘의 케어 말풍선 */}
        <div className="mt-3.5 flex items-start gap-3">
          <button
            onClick={() => navigate('/closet/decorate')}
            aria-label="내 캐릭터 꾸미기"
            className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-visible rounded-full bg-primary-light active:scale-95 transition-transform"
          >
            <img
              src={FACE_SRC[character.expression]}
              alt="내 캐릭터"
              className="h-[88%] w-[88%] object-contain"
            />
            {/* 꾸미기 힌트 뱃지 */}
            <span className="absolute -bottom-1 -right-1 inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
              ✨꾸미기
            </span>
          </button>
          {/* 말풍선 (왼쪽 위 꼬리) */}
          <div className="min-w-0 flex-1 rounded-[4px_14px_14px_14px] bg-gray-5 px-3 py-2.5">
            <p className="text-[13px] leading-relaxed text-gray-70">
              <span className="font-extrabold text-primary">오늘의 케어</span> · {tip}
            </p>
          </div>
        </div>

        {/* 경험치 행 — 닉네임 + 레벨/칭호 · 진행바 · 경험치 */}
        <div className="mt-3 flex items-center gap-3">
          <span className="shrink-0 whitespace-nowrap text-sm font-extrabold text-gray-100">
            {user.nickname}
            <span className="ml-1.5 text-[11px] font-bold text-gray-50">
              Lv.{character.level} {character.title}
            </span>
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-10">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${expPct}%` }}
            />
          </div>
          <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-50">
            {character.exp}/{character.nextLevelExp}
          </span>
        </div>
      </div>

      {/* 대체품 절약 가능 배너 (탭 → 대체품 모아보기) */}
      <button
        onClick={() => navigate('/alternatives?from=home')}
        className="mt-2.5 flex w-full items-center gap-2.5 rounded-[14px] bg-primary-light px-3.5 py-3 text-left active:scale-[0.99] transition-transform"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3v18M5 10l7-7 7 7" />
          </svg>
        </span>
        <p className="flex-1 text-[13px] leading-snug text-primary-dark">
          <span className="font-extrabold">이번 달 {registry.totalSavings.toLocaleString()}원 절약 가능</span>
          {' — 내 화장대 '}
          {registry.count}
          개 제품의 대체품을 찾았어요
        </p>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M9 18l6-6-6-6" stroke="#3D8F6F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}
