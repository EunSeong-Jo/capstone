import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ProfileUser } from '../types';
import { MOCK_PROFILE } from '../mocks/home';
import { UserProfileContext } from './userProfile';

const STORAGE_KEY = 'dcmy:userProfile:v1';

function readStorage(): Partial<ProfileUser> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<ProfileUser>) : {};
  } catch {
    return {};
  }
}

function writeStorage(patch: Partial<ProfileUser>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patch));
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
 * 저장하는 것은 사용자가 바꾼 값(patch)뿐입니다. MOCK_PROFILE을 통째로 저장하면
 * 목업이 바뀌어도 낡은 값이 계속 살아남기 때문입니다.
 *
 * TODO: Task 12(인증) 연동 시 시드를 MOCK_PROFILE에서 로그인 응답으로 교체.
 */
export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [patch, setPatch] = useState<Partial<ProfileUser>>(() => readStorage());

  useEffect(() => {
    writeStorage(patch);
  }, [patch]);

  const updateProfile = useCallback((next: Partial<ProfileUser>) => {
    setPatch((prev) => ({ ...prev, ...next }));
  }, []);

  const resetProfile = useCallback(() => setPatch({}), []);

  const profile = useMemo<ProfileUser>(() => ({ ...MOCK_PROFILE, ...patch }), [patch]);

  const value = useMemo(
    () => ({ profile, updateProfile, resetProfile }),
    [profile, updateProfile, resetProfile],
  );

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}
