import { createContext, useContext } from 'react';

/**
 * Context 객체·타입·훅만 담습니다.
 *
 * Provider(`CharacterContext.tsx`)와 파일을 나눈 이유는 Fast Refresh 때문입니다 —
 * 자세한 배경은 `closet.ts` 상단 주석을 보세요.
 */

export interface CharacterContextValue {
  /** 캐릭터에 얹은 장식. null이면 없음. */
  decorationId: number | null;
  /** 저장까지 한다. 실패하면 이전 값으로 되돌린다. */
  setDecoration: (id: number | null) => void;
}

export const CharacterContext = createContext<CharacterContextValue | null>(null);

export function useCharacter() {
  const ctx = useContext(CharacterContext);
  if (!ctx) throw new Error('useCharacter must be used within a CharacterProvider');
  return ctx;
}
