import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { findPersonaById } from '../data/personas';
import { useAuth } from './AuthContext';
import { hasKey, readJSON, writeJSON } from './storage';

/**
 * 내 화장대 — 사용자가 보유한 화장품 목록.
 *
 * 로그인하면 페르소나의 `ownedCosmetics`로 1회 시드되고, 이후 OCR 스캔·챗봇 등록·
 * 검색으로 직접 추가한다. 범위(scope)별로 분리 저장한다.
 * 예전 정적 목업(mocks/closet.ts)을 대체한다.
 */

const keyOf = (scope: string) => `swappy:closet:v1:${scope}`;

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

interface ClosetContextValue {
  items: ClosetItem[];
  count: number;
  hasItem: (id: number) => boolean;
  addItem: (draft: ClosetDraft) => void;
  removeItem: (id: number) => void;
  setStatus: (id: number, status: ClosetStatus) => void;
  clearCloset: () => void;
}

const ClosetContext = createContext<ClosetContextValue | null>(null);

const picsum = (seed: string | number) => `https://picsum.photos/seed/closet${seed}/108/108`;

export function ClosetProvider({ children }: { children: ReactNode }) {
  const { scope, status } = useAuth();
  const [items, setItems] = useState<ClosetItem[]>(() => readJSON<ClosetItem[]>(keyOf(scope), []));
  const lastScope = useRef(scope);

  // 범위 전환 — 로그인 시 페르소나 보유품으로 1회 시드
  useEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;

    const key = keyOf(scope);
    const seeded = hasKey(key);
    if (!seeded && status === 'user' && scope !== 'guest') {
      const persona = findPersonaById(scope);
      if (persona) {
        const seedItems: ClosetItem[] = persona.ownedCosmetics.map((c) => ({
          id: c.id,
          brand: c.brand,
          name: c.name,
          category: c.category,
          price: c.price,
          imageUrl: picsum(c.id),
          keyIngredients: c.keyIngredients,
          status: 'owned',
          addedVia: 'seed',
          addedAt: Date.now(),
        }));
        writeJSON(key, seedItems);
        setItems(seedItems);
        return;
      }
    }
    setItems(readJSON<ClosetItem[]>(key, []));
  }, [scope, status]);

  useEffect(() => {
    writeJSON(keyOf(scope), items);
  }, [items, scope]);

  const hasItem = useCallback((id: number) => items.some((i) => i.id === id), [items]);

  const addItem = useCallback((draft: ClosetDraft) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === draft.id)) return prev;
      const item: ClosetItem = {
        ...draft,
        imageUrl: draft.imageUrl ?? picsum(draft.id),
        status: draft.status ?? 'owned',
        addedAt: Date.now(),
      };
      return [item, ...prev];
    });
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const setStatus = useCallback((id: number, next: ClosetStatus) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: next } : i)));
  }, []);

  const clearCloset = useCallback(() => setItems([]), []);

  const value = useMemo<ClosetContextValue>(
    () => ({
      items,
      count: items.length,
      hasItem,
      addItem,
      removeItem,
      setStatus,
      clearCloset,
    }),
    [items, hasItem, addItem, removeItem, setStatus, clearCloset],
  );

  return <ClosetContext.Provider value={value}>{children}</ClosetContext.Provider>;
}

export function useCloset() {
  const ctx = useContext(ClosetContext);
  if (!ctx) throw new Error('useCloset must be used within a ClosetProvider');
  return ctx;
}
