import { createContext, useContext } from 'react';

/**
 * Context 객체·타입·훅만 담습니다.
 *
 * Provider(`ClosetContext.tsx`)와 파일을 나눈 이유는 Fast Refresh 때문입니다.
 * 컴포넌트와 비컴포넌트를 한 모듈에서 export하면 HMR이 모듈을 갈아끼우지 못해
 * **전체 새로고침**이 걸립니다(react-refresh/only-export-components).
 * 이 앱에서는 그때마다 보고 있던 화면과 스크롤이 초기화돼 스플래시부터
 * 다시 시작합니다. `userProfile.ts`가 먼저 쓴 방식을 따릅니다.
 */

export type ClosetStatus = 'owned' | 'analyzing' | 'scanned';
export type ClosetSource = 'seed' | 'scan' | 'chatbot' | 'search';

export interface ClosetItem {
  id: number;
  brand: string;
  name: string;
  category: string;
  price?: number;
  imageUrl?: string;
  keyIngredients?: string[];
  status: ClosetStatus;
  addedVia: ClosetSource;
  addedAt: number;
}

export type ClosetDraft = Omit<ClosetItem, 'addedAt' | 'status'> & {
  status?: ClosetStatus;
};

export interface ClosetContextValue {
  items: ClosetItem[];
  count: number;
  /** 서버에서 불러오는 중. 화면은 스켈레톤을 보여주면 된다. */
  loading: boolean;
  hasItem: (id: number) => boolean;
  addItem: (draft: ClosetDraft) => void;
  removeItem: (id: number) => void;
  setStatus: (id: number, status: ClosetStatus) => void;
  clearCloset: () => void;
}

export const ClosetContext = createContext<ClosetContextValue | null>(null);

export function useCloset() {
  const ctx = useContext(ClosetContext);
  if (!ctx) throw new Error('useCloset must be used within a ClosetProvider');
  return ctx;
}
