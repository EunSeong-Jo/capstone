import { useNavigate } from 'react-router-dom';
import { CharacterState, ProfileUser, RegistrySummary, WeatherInfo, SkinType, SKIN_TYPE_META } from '../../../../types';

/**
 * 피부타입별 마스코트 에셋 경로 (public/mascot/).
 *
 * base_face_*.png(표정별)는 캐릭터가 아직 피부타입을 대표하지 않는 범용
 * 이미지라 여기서는 안 쓴다 — character.skinType("캐릭터가 대표하는
 * 피부타입", types/index.ts)에 맞는 전용 일러스트로 항상 고정한다.
 * 타입마다 이미지가 1장뿐이라 표정(expression) 구분은 없다.
 */
const TYPE_FACE_SRC: Record<SkinType, string> = {
  ondalsam: '/mascot/수분팡팡옹달샙타입.png',
  mulgae: '/mascot/반질반질물개타입.png',
  subuji: '/mascot/겉바속촉수부지타입.png',
  hwasan: '/mascot/울긋불긋화산타입.png',
  samak: '/mascot/바스락사막타입.png',
  injeolmi: '/mascot/말랑말랑인절미타입.png',
  yuriguseul: '/mascot/조심조심유리구슬타입.png',
  memilmuk: '/mascot/얼룩덜룩메밀묵타입.png',
};

interface ProfileDashboardProps {
  /** null이면 로딩 중 — 스켈레톤을 보여준다. useWeather 참고 */
  weather: WeatherInfo | null;
  /** 오늘의 케어 문구. AI 생성 결과(또는 실패 시 정적 폴백) — useCareTip이 넘겨준다.
   *  null이면 로딩 중 — 스켈레톤을 보여준다. */
  careTip: string | null;
  character: CharacterState;
  user: ProfileUser;
  registry: RegistrySummary;
}

/**
 * 홈 개인 대시보드 — 미니멀 뉴트럴.
 * 상단 미니 날씨바(계절·피부타입 칩) + 오늘의 케어 / 마스코트(탭→옷장)·프로필·경험치.
 * 카드 아래 '대체품 절약 가능' 그린 배너.
 */
export function ProfileDashboard({ weather, careTip, character, user, registry }: ProfileDashboardProps) {
  const navigate = useNavigate();
  const meta = SKIN_TYPE_META[user.skinType];
  // "수분팡팡 옹달샘" → "옹달샘" (칩용 짧은 피부명)
  const skinWords = meta.label.split(' ');
  const shortSkinName = skinWords[skinWords.length - 1] || meta.label;
  // 레벨·경험치는 /me/stats가 붙기 전까지 근거가 없다. 값이 없으면 줄을 숨긴다.
  const hasLevel =
    character.level !== undefined &&
    character.exp !== undefined &&
    character.nextLevelExp !== undefined &&
    character.nextLevelExp > 0;
  const expPct = hasLevel
    ? Math.min(100, Math.round((character.exp! / character.nextLevelExp!) * 100))
    : 0;

  return (
    <section className="px-4 pt-3 pb-4">
      <div className="rounded-[24px] bg-white border border-gray-10 shadow-soft p-5">
        {/* 상단 미니 날씨바 (조건·온도·습도 + 피부타입 칩). weather가 null이면
            아직 로딩 중이라는 뜻 — 더미 값 대신 펄스 플레이스홀더를 보여준다 */}
        <div className="flex items-center justify-between gap-2">
          {weather ? (
            <div className="flex items-center gap-1.5 text-sm font-bold text-gray-100 min-w-0">
              <img
                src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                alt={weather.conditionLabel}
                className="h-6 w-6 -my-1 shrink-0"
              />
              <span>{weather.conditionLabel}</span>
              <span className="text-gray-20">·</span>
              <span>{weather.temperature}°</span>
              {weather.humidity != null && (
                <>
                  <span className="text-gray-20">·</span>
                  <span className="font-medium text-gray-50">습도 {weather.humidity}%</span>
                </>
              )}
            </div>
          ) : (
            <div className="h-[22px] w-32 animate-pulse rounded-full bg-gray-10" />
          )}
          <span className="shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-primary-light text-[11px] font-bold text-primary">
            {meta.emoji} {shortSkinName}
          </span>
        </div>
        {/* 마스코트(탭→옷장) + [오늘의 케어 말풍선 / 레벨·진행바] 세로 스택 */}
        {/* 닉네임을 없애면서 생긴 여백을 마스코트 확대로 채운다 — 그만큼 오른쪽
            콘텐츠(케어·레벨)가 쓸 수 있는 폭이 줄어드는 건 의도된 트레이드오프다.
            items-center: 문구가 AI 생성이라 길이가 매번 달라진다(1줄일 때도, 2줄일
            때도 있음) — 줄 수와 무관하게 마스코트 세로 중앙에 맞춘다. */}
        <div className="mt-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate('/closet/decorate')}
            aria-label="내 캐릭터 꾸미기"
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-visible rounded-full bg-primary-light active:scale-95 transition-transform"
          >
            <img
              src={TYPE_FACE_SRC[character.skinType]}
              alt="내 캐릭터"
              className="h-[88%] w-[88%] object-contain"
            />
            {/* 꾸미기 힌트 뱃지 */}
            <span className="absolute -bottom-1 -right-1 inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
              ✨꾸미기
            </span>
          </button>

          {/* 오른쪽 컬럼 높이 = 마스코트(80px) + 뱃지 돌출분(4px) + 레벨 텍스트
              line-height 여백 보정(4px). 뱃지는 -bottom-1로 마스코트 원 밖으로
              튀어나와 있고, 레벨 줄 텍스트는 박스 안에서 line-height 때문에 실제
              글자가 박스 하단보다 위쪽에 떠 보인다 — 두 효과를 합쳐서 늘렸다.
              justify-between: 말풍선(flex-1)이 남는 공간을 채우고, 레벨 줄은 항상
              컬럼 맨 아래에 붙는다. 문구 길이가 달라져도 이 정렬은 안 깨진다. */}
          <div className="min-w-0 flex-1 h-[88px] flex flex-col justify-between gap-2">
            <div
              className="min-w-0 flex-1 flex items-center rounded-2xl bg-gray-5 px-3 py-2"
              aria-label="오늘의 케어"
            >
              {careTip !== null ? (
                <p className="text-[13px] leading-relaxed text-gray-70">{careTip}</p>
              ) : (
                <div className="w-full space-y-1.5">
                  <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-gray-10" />
                  <div className="h-2.5 w-2/5 animate-pulse rounded-full bg-gray-10" />
                </div>
              )}
            </div>

            {/* 레벨/칭호 · 진행바 · 경험치. 닉네임은 제거하되, 레벨 자체는 기존
                보조 텍스트 스타일 그대로 — 위 말풍선과 폭(컬럼)만 맞춘다 */}
            {hasLevel && (
              <div className="shrink-0 flex items-center gap-3">
                <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-gray-50">
                  Lv.{character.level} {character.title}
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
            )}
          </div>
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
          {registry.totalSavings !== undefined ? (
            <>
              <span className="font-extrabold">
                {registry.totalSavings.toLocaleString()}원 절약 가능
              </span>
              {' — 내 화장대 '}
              {registry.count}
              개 제품의 대체품을 찾았어요
            </>
          ) : (
            <>
              <span className="font-extrabold">내 화장대 대체품 찾기</span>
              {registry.count > 0
                ? ` — 등록한 ${registry.count}개 제품의 성분을 비교해요`
                : ' — 쓰는 제품을 등록하면 비교해 드려요'}
            </>
          )}
        </p>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M9 18l6-6-6-6" stroke="#3D8F6F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}
