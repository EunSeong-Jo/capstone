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

/**
 * removed는 화장대에서 뺀 제품('삭제된 제품')이다. 다시 담으면 owned로 돌아온다.
 * scanned·analyzing은 예전 값이라 owned와 같게 다룬다.
 */
export type ClosetStatus = 'owned' | 'removed' | 'analyzing' | 'scanned';
/** order는 주문하면 서버가 자동으로 담은 것이다(취소·반품하면 삭제된 제품이 된다) */
export type ClosetSource = 'seed' | 'scan' | 'chatbot' | 'search' | 'order';

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
  /** 화장대에 있는 제품. 삭제된 제품은 빠진다 — 대체품·추천의 기준은 이것이다 */
  items: ClosetItem[];
  count: number;
  /** '삭제된 제품'. 복원하거나 영구 삭제할 수 있다 */
  removedItems: ClosetItem[];
  /** 서버에서 불러오는 중. 화면은 스켈레톤을 보여주면 된다. */
  loading: boolean;
  /** 화장대에 있는지. 삭제된 제품은 false다 */
  hasItem: (id: number) => boolean;
  /** 담기. 삭제된 제품이면 복원된다 */
  addItem: (draft: ClosetDraft) => void;
  /** '삭제된 제품'으로 옮긴다 */
  removeItem: (id: number) => void;
  restoreItem: (id: number) => void;
  /** 삭제된 제품에서도 지운다. 되돌릴 수 없다 */
  purgeItem: (id: number) => void;
  clearCloset: () => void;
  /** 서버 화장대를 다시 받는다. 주문·취소·반품처럼 서버가 화장대를 바꾼 뒤 부른다 */
  reload: () => Promise<void>;
}

export const ClosetContext = createContext<ClosetContextValue | null>(null);

export function useCloset() {
  const ctx = useContext(ClosetContext);
  if (!ctx) throw new Error('useCloset must be used within a ClosetProvider');
  return ctx;
}
