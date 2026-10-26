import { useNavigate } from 'react-router-dom';
import {
  CharacterState,
  ProfileUser,
  RegistrySummary,
  SKIN_TYPE_META,
  UNKNOWN_SKIN_META,
  WeatherInfo,
} from '../../../../types';
import { CharacterAvatar } from '../../../character/CharacterAvatar';
import { useCharacter } from '../../../../context/character';
import { useAuth } from '../../../../context/auth';

interface ProfileDashboardProps {
  /** null이면 로딩 중 — 스켈레톤을 보여준다. useWeather 참고 */
  weather: WeatherInfo | null;
  /** 오늘의 케어 문구. AI 생성 결과(또는 실패 시 정적 폴백) — useCareTip이 넘겨준다.
   *  null이면 로딩 중 — 스켈레톤을 보여준다. */
  careTip: string | null;
  character: CharacterState;
  /**
   * 레벨을 아직 받아오는 중이다(로그인 사용자).
   *
   * 비회원과 구분해야 한다 — 비회원은 셀 대상이 서버에 없어 줄을 아예 그리지
   * 않지만, 로그인 사용자에게는 곧 값이 온다. 없다가 갑자기 튀어나오면
   * 레이아웃이 밀리므로 자리만 먼저 잡아 둔다.
   */
  levelPending?: boolean;
  /**
   * 피부타입을 아직 받아오는 중이다.
   *
   * `character.skinType === null`이 "진단을 안 했다"인지 "아직 모른다"인지
   * 구분하려면 이 값이 필요하다. 전자는 진단을 권해야 하고, 후자는
   * 기다려야 한다 — 잘못 고르면 진단한 사용자에게 "진단하세요"가 뜬다.
   */
  skinPending?: boolean;
  user: ProfileUser;
  registry: RegistrySummary;
}

/**
 * 홈 개인 대시보드 — 미니멀 뉴트럴.
 * 상단 미니 날씨바(계절·피부타입 칩) + 오늘의 케어 / 마스코트(탭→옷장)·프로필·경험치.
 * 카드 아래 '대체품 절약 가능' 그린 배너.
 */
export function ProfileDashboard({
  weather,
  careTip,
  character,
  user,
  registry,
  levelPending = false,
  skinPending = false,
}: ProfileDashboardProps) {
  // 꾸미기는 전역 상태다 — 꾸미기 화면에서 저장하면 여기도 같이 바뀐다.
  const { decorationId, loading: decoPending } = useCharacter();
  // 진단은 로그인 이후에만 가능하다. 게스트를 /qna로 보내면 가드가 한 번 더
  // 튕기므로, 목적지와 문구를 미리 맞춘다.
  const { isUser } = useAuth();
  const navigate = useNavigate();

  const meta = user.skinType !== null ? SKIN_TYPE_META[user.skinType] : UNKNOWN_SKIN_META;
  // "수분팡팡 옹달샘" → "옹달샘" (칩용 짧은 피부명)
  const skinWords = meta.label.split(' ');
  const shortSkinName = skinWords[skinWords.length - 1] || meta.label;

  /**
   * 얼굴과 장식은 둘 다 로그인 직후 도착한다. 하나라도 아직이면 아바타를
   * 통째로 스켈레톤으로 둔다 — 얼굴을 먼저 그리고 장식만 나중에 얹으면
   * 같은 자리가 두 번 깜빡인다.
   */
  const avatarPending = skinPending || decoPending;
  /** 진단을 한 적이 없다(확인은 끝났다). 기다릴 게 아니라 권해야 한다. */
  const needsDiagnosis = !skinPending && user.skinType === null;
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
          {skinPending ? (
            <span
              aria-hidden
              className="h-[22px] w-24 shrink-0 animate-pulse rounded-full bg-gray-10"
            />
          ) : needsDiagnosis ? (
            /* 진단 전. 8종 중 하나를 골라 보여주면 그게 곧 거짓이라, 대신
               진단으로 보낸다. */
            <button
              type="button"
              onClick={() => navigate(isUser ? '/qna' : '/login')}
              className="shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-primary text-[11px] font-bold text-white active:scale-95 transition-transform"
            >
              {UNKNOWN_SKIN_META.emoji} {isUser ? '피부타입 진단하기' : '로그인하고 진단하기'}
            </button>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-primary-light text-[11px] font-bold text-primary">
              {/* 별명만 적으면 그게 지성인지 건성인지 알 수 없다. 일반 명칭을
                  괄호로 함께 둔다. */}
              {meta.emoji} {shortSkinName}({meta.category})
            </span>
          )}
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
            {avatarPending ? (
              <span aria-hidden className="h-[88%] w-[88%] animate-pulse rounded-full bg-gray-10" />
            ) : (
              <CharacterAvatar
                skinType={character.skinType}
                decorationId={decorationId}
                className="h-[88%] w-[88%]"
              />
            )}
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
            {!hasLevel && levelPending && (
              <div className="shrink-0 flex items-center gap-3" aria-hidden>
                <span className="h-3 w-10 shrink-0 animate-pulse rounded-full bg-gray-10" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-10" />
                <span className="h-3 w-8 shrink-0 animate-pulse rounded-full bg-gray-10" />
              </div>
            )}
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
                최대 {registry.totalSavings.toLocaleString()}원 절약 가능
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
