import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { readJSON, writeJSON } from './storage';

/**
 * 캐릭터 꾸미기(데코레이션) 선택 상태.
 *
 * DecoratePage에서 저장하면 홈 마스코트·마이 프로필 사진에도 같은 데코가
 * 바로 반영돼야 해서(예전엔 로컬 state뿐이라 화면을 벗어나면 사라졌다)
 * 다른 전역 상태들과 같은 패턴으로 scope별 localStorage에 둔다.
 */
const keyOf = (scope: string) => `swappy:decoration:v1:${scope}`;

interface CharacterContextValue {
  decorationId: number | null;
  setDecoration: (id: number | null) => void;
}

const CharacterContext = createContext<CharacterContextValue | null>(null);

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { scope } = useAuth();
  const [decorationId, setDecorationId] = useState<number | null>(() => readJSON(keyOf(scope), null));

  useEffect(() => {
    setDecorationId(readJSON(keyOf(scope), null));
  }, [scope]);

  const setDecoration = (id: number | null) => {
    setDecorationId(id);
    writeJSON(keyOf(scope), id);
  };

  return (
    <CharacterContext.Provider value={{ decorationId, setDecoration }}>
      {children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  const ctx = useContext(CharacterContext);
  if (!ctx) throw new Error('useCharacter must be used within a CharacterProvider');
  return ctx;
}
