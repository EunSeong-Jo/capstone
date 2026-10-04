import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScanDto, addScan, fetchScans } from '../api/personal';
import { useAuth } from '../context/auth';
import { readJSON, writeJSON } from '../context/storage';
import { load, meKey, peek, put } from '../api/queryCache';
import type { Product } from '../types';

export interface ScanHistoryItem {
  /** 목록 key. 같은 제품을 두 번 스캔할 수 있어 제품 id와 따로 둔다 */
  key: string;
  id: number;
  name: string;
  brand: string;
  category: string;
  price?: number;
  imageUrl?: string;
  scannedAt: number;
}

const GUEST_KEY = 'swappy:scans:v1:guest';
/** 비회원 기록은 기기에만 쌓이니 끝없이 늘지 않게 자른다 */
const GUEST_LIMIT = 50;

const fromServer = (s: ScanDto): ScanHistoryItem => ({
  key: `scan-${s.id}`,
  id: s.product!.id,
  name: s.product!.name,
  brand: s.product!.brand,
  category: s.product!.category,
  price: s.product!.price,
  imageUrl: s.product!.imageUrl,
  scannedAt: new Date(s.createdAt).getTime(),
});

const fromProduct = (p: Product, key: string): ScanHistoryItem => ({
  key,
  id: p.id,
  name: p.name,
  brand: p.brand,
  category: p.category,
  price: p.price,
  imageUrl: p.imageUrl,
  scannedAt: Date.now(),
});

/** 화면을 다시 열 때는 지난 기록을 먼저 보이고, 30초가 지났으면 뒤에서 새로 받는다 */
const SCANS_FRESH_MS = 30 * 1000;

/**
 * 스캔 기록 — 스캔 화면에서 찾은 제품. **화장대와는 따로다.**
 *
 * 스캔은 "이 제품을 찾아봤다"는 기록이고, 화장대는 "쓰고 있다"는 기록이다.
 * 예전에는 스캔한 제품을 화장대에 담아야 기록이 남았고, 비회원은 화장대의
 * 스캔 항목을 기록으로 대신 보여줬다. 이제 스캔하면 여기에 먼저 남고,
 * 화장대에는 사용자가 고를 때만 담긴다.
 *
 * 로그인 상태면 서버(`/me/scans`, 최신순), 비회원이면 localStorage.
 * 스캔 화면의 '최근 스캔'과 '전체보기'(ScanHistoryPage)가 같이 쓴다.
 */
export function useScanHistory() {
  const { isUser, scope } = useAuth();
  const cacheKey = meKey(scope, 'scans');
  // 남기면 version을 올려 캐시(회원)·localStorage(비회원)를 다시 읽게 한다.
  const [version, setVersion] = useState(0);
  const [fetched, setFetched] = useState<{ key: string } | null>(null);
  const guestScans = useMemo(
    () => readJSON<ScanHistoryItem[]>(GUEST_KEY, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 남긴 뒤 다시 읽기 위한 키
    [scope, version],
  );

  useEffect(() => {
    if (!isUser) return;
    let alive = true;
    load(
      cacheKey,
      () => fetchScans().then((s) => s.filter((x) => x.product !== null).map(fromServer)),
      SCANS_FRESH_MS,
    )
      .catch(() => [])
      .finally(() => {
        if (alive) setFetched({ key: cacheKey });
      });
    return () => {
      alive = false;
    };
  }, [isUser, cacheKey]);

  /** 스캔 기록 남기기. 화면은 바로 반영하고 서버는 뒤따른다 */
  const record = useCallback(
    (product: Product) => {
      const item = fromProduct(product, `local-${Date.now()}-${product.id}`);
      if (isUser) {
        put(cacheKey, [item, ...(peek<ScanHistoryItem[]>(cacheKey)?.value ?? [])]);
        void addScan(product.id, 'search').catch(() => {
          put(
            cacheKey,
            (peek<ScanHistoryItem[]>(cacheKey)?.value ?? []).filter((s) => s.key !== item.key),
          );
          setVersion((v) => v + 1);
        });
      } else {
        writeJSON(GUEST_KEY, [item, ...readJSON<ScanHistoryItem[]>(GUEST_KEY, [])].slice(0, GUEST_LIMIT));
      }
      setVersion((v) => v + 1);
    },
    [isUser, cacheKey],
  );

  if (!isUser) return { items: guestScans, loading: false, record };

  const cached = peek<ScanHistoryItem[]>(cacheKey)?.value;
  return {
    items: cached ?? [],
    loading: cached === undefined && fetched?.key !== cacheKey,
    record,
  };
}
