import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { readJSON, writeJSON } from './storage';

const keyOf = (scope: string) => `swappy:exp:v1:${scope}`;

/** 레벨업에 필요한 경험치. Lv.N → Lv.N+1 은 N*100 EXP. */
function levelFromExp(totalExp: number) {
  let level = 1;
  let remaining = totalExp;
  let threshold = level * 100;
  while (remaining >= threshold) {
    remaining -= threshold;
    level += 1;
    threshold = level * 100;
  }
  return { level, exp: remaining, nextLevelExp: threshold };
}

interface ExperienceContextValue {
  level: number;
  exp: number;
  nextLevelExp: number;
  totalExp: number;
  /** 성분 스캔 1회(+10) · 후기 작성(+20) · 제품 주문(+50) 등 실제 행동에 붙여 호출한다 */
  addExp: (amount: number) => void;
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const { scope } = useAuth();
  const [totalExp, setTotalExp] = useState<number>(() => readJSON(keyOf(scope), 0));

  useEffect(() => {
    setTotalExp(readJSON(keyOf(scope), 0));
  }, [scope]);

  const addExp = (amount: number) => {
    setTotalExp((prev) => {
      const next = prev + amount;
      writeJSON(keyOf(scope), next);
      return next;
    });
  };

  const { level, exp, nextLevelExp } = levelFromExp(totalExp);

  return (
    <ExperienceContext.Provider value={{ level, exp, nextLevelExp, totalExp, addExp }}>
      {children}
    </ExperienceContext.Provider>
  );
}

export function useExperience() {
  const ctx = useContext(ExperienceContext);
  if (!ctx) throw new Error('useExperience must be used within an ExperienceProvider');
  return ctx;
}
