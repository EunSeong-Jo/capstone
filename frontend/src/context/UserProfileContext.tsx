import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ProfileUser } from '../types';
import { useAuth } from './auth';
import { UserProfileContext } from './userProfile';

/**
 * 계정별로 나눈다.
 *
 * 예전에는 `dcmy:userProfile:v1` 한 칸이었고 아무도 지우지 않았다
 * (`resetProfile`을 호출하는 화면이 없다). 그래서 로그인해서 닉네임을 고친
 * 뒤 "로그인 없이 둘러보기"를 고르면 **그 닉네임이 게스트 화면에 그대로
 * 남았다.** 저장소의 다른 개인 데이터는 전부 이 규칙을 쓴다
 * (`closet`·`cart`·`likes`·`recent`·`decoration`·`diag`).
 *
 * 옛 키는 이관하지 않는다. 어느 계정이 쓴 값인지 알 수 없어서, 옮기면
 * 지금 고치려는 그 유출을 그대로 보존하게 된다.
 */
const keyOf = (scope: string) => `swappy:profile:v1:${scope}`;

function readStorage(scope: string): Partial<ProfileUser> {
  try {
    const raw = localStorage.getItem(keyOf(scope));
    return raw ? (JSON.parse(raw) as Partial<ProfileUser>) : {};
  } catch {
    return {};
  }
}

function writeStorage(scope: string, patch: Partial<ProfileUser>) {
  try {
    localStorage.setItem(keyOf(scope), JSON.stringify(patch));
  } catch {
    // localStorage 사용 불가 시 조용히 무시
  }
}

/**
 * 사용자 프로필 전역 공유.
 *
 * 이전에는 ProfileEditPage가 import한 MOCK_PROFILE을 직접 변조했습니다. 리렌더가
 * 트리거되지 않아 화면 이동으로 리마운트된 곳만 갱신됐고 새로고침하면 사라졌습니다.
 *
 * 저장하는 것은 사용자가 바꾼 값(patch)뿐입니다. 바탕값을 통째로 저장하면
 * 로그인 계정이 바뀌어도 낡은 값이 계속 살아남기 때문입니다.
 *
 * 바탕값은 로그인한 계정에서 옵니다. 예전에는 mocks/home.ts의 MOCK_PROFILE
 * ('대체러' / user@email.com / '960101-OY1****')이었는데, 조은성으로
 * 로그인해도 마이페이지에 '대체러'가 떴습니다.
 *
 * TODO: Task 12(인증) 연동 시 persona 대신 GET /me 응답을 씁니다.
 */
/**
 * 비로그인 상태의 바탕값. 가짜 이메일·식별번호를 만들지 않습니다.
 *
 * `skinType`도 지어내지 않습니다. 예전에는 `'ondalsam'`이라 게스트와 진단 전
 * 계정이 모두 "옹달샘"으로 보였습니다 — 화면은 null을 `UNKNOWN_SKIN_META`로
 * 그립니다.
 */
const GUEST_PROFILE: ProfileUser = {
  nickname: '게스트',
  skinType: null,
};

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user: persona, isUser, scope } = useAuth();

  /** 수정한 값 + 그것이 어느 계정의 것인지. 계정이 바뀌면 남의 값이다. */
  const [store, setStore] = useState<{ scope: string; patch: Partial<ProfileUser> }>(
    () => ({ scope, patch: readStorage(scope) }),
  );

  // 계정 전환은 렌더 중에 반영한다 — effect에서 하면 렌더가 한 번 더 돈다
  // (ClosetContext·CharacterContext와 같은 형태다).
  if (store.scope !== scope) {
    setStore({ scope, patch: readStorage(scope) });
  }

  const patch = store.patch;

  useEffect(() => {
    writeStorage(store.scope, store.patch);
  }, [store]);

  const updateProfile = useCallback((next: Partial<ProfileUser>) => {
    setStore((prev) => ({ scope: prev.scope, patch: { ...prev.patch, ...next } }));
  }, []);

  const resetProfile = useCallback(
    () => setStore((prev) => ({ scope: prev.scope, patch: {} })),
    [],
  );

  const base = useMemo<ProfileUser>(
    () =>
      isUser && persona
        ? {
            nickname: persona.nickname,
            // 진단 전 가입 계정은 서버에 피부타입이 없다. 그때는 게스트 기본값을
            // 쓰되, 화면이 "당신은 옹달샘"이라고 단정하지 않도록 진단 결과가
            // 있으면 DiagnosisContext가 덮어쓴다.
            skinType: persona.skinType ?? GUEST_PROFILE.skinType,
            email: persona.email,
            memberSince: persona.memberSince,
          }
        : GUEST_PROFILE,
    [isUser, persona],
  );

  const profile = useMemo<ProfileUser>(() => ({ ...base, ...patch }), [base, patch]);

  const value = useMemo(
    () => ({ profile, updateProfile, resetProfile }),
    [profile, updateProfile, resetProfile],
  );

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}
