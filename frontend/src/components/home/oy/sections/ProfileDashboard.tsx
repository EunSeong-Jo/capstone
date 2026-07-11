import { useNavigate } from 'react-router-dom';
import { CharacterState, ProfileUser, WeatherInfo, SKIN_TYPE_META } from '../../../../types';
import { WEATHER_VISUAL, getSkinCareTip } from '../../../../mocks/home';
import { ExpBar } from './ExpBar';

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
}

/**
 * 홈 개인 대시보드 — 미니멀 뉴트럴.
 * 상단 미니 날씨바 + 오늘의 케어 / 마스코트(탭→옷장)·프로필·경험치.
 */
export function ProfileDashboard({ weather, character, user }: ProfileDashboardProps) {
  const navigate = useNavigate();
  const meta = SKIN_TYPE_META[user.skinType];
  const visual = WEATHER_VISUAL[weather.condition];
  const tip = getSkinCareTip(user.skinType, weather.condition);

  return (
    <section className="px-4 pt-3 pb-4">
      <div className="rounded-[24px] bg-white border border-gray-10 shadow-soft p-5">
        {/* 상단 미니 날씨바 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-100">
            <span className="text-lg leading-none">{visual.emoji}</span>
            <span>{weather.conditionLabel}</span>
            <span className="text-gray-20">·</span>
            <span>{weather.temperature}°</span>
          </div>
          {weather.humidity != null && (
            <span className="text-xs text-gray-50">습도 {weather.humidity}%</span>
          )}
        </div>
        {/* 오늘의 케어 한 줄 */}
        <p className="mt-1.5 text-[13px] leading-snug text-gray-70 truncate">
          <span className="font-bold text-primary">오늘의 케어 </span>
          {tip}
        </p>

        <div className="my-4 h-px bg-gray-10" />

        {/* 프로필 — 마스코트(탭→옷장) + 닉네임 + 경험치 */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/closet')}
            aria-label="내 캐릭터 꾸미기"
            className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-visible rounded-full bg-gray-5 active:scale-95 transition-transform"
          >
            <img
              src={FACE_SRC[character.expression]}
              alt="내 캐릭터"
              className="h-[86%] w-[86%] object-contain"
            />
            {/* 꾸미기 힌트 뱃지 */}
            <span className="absolute -bottom-1 -right-1 inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
              ✨꾸미기
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-lg font-extrabold leading-tight text-gray-100">{user.nickname}</p>
              <span className="text-base leading-none">{meta.emoji}</span>
            </div>
            <p className="mb-2 text-xs text-gray-50">{meta.label}</p>
            <ExpBar
              level={character.level}
              exp={character.exp}
              nextLevelExp={character.nextLevelExp}
              title={character.title}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
