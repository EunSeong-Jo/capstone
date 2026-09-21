import { createContext, useContext } from 'react';
import { ProfileUser } from '../types';

/**
 * Context 객체와 훅만 담습니다.
 *
 * Provider(UserProfileContext.tsx)와 파일을 나눈 이유는 Fast Refresh 때문입니다.
 * 컴포넌트와 비컴포넌트를 한 모듈에서 export하면 HMR이 모듈을 갈아끼우지 못해
 * 전체 새로고침이 걸립니다(react-refresh/only-export-components).
 * LikedProductsContext.tsx가 그 경고를 안고 있어 여기서는 답습하지 않습니다.
 */
export interface UserProfileContextValue {
  profile: ProfileUser;
  updateProfile: (patch: Partial<ProfileUser>) => void;
  resetProfile: () => void;
}

export const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return ctx;
}
