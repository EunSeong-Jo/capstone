import { useEffect, useState } from 'react';
import { ScanDto, fetchScans } from '../api/personal';
import { useAuth } from '../context/auth';
import { useCloset } from '../context/closet';

export interface ScanHistoryItem {
  /** 목록 key. 같은 제품을 두 번 스캔할 수 있어 제품 id와 따로 둔다 */
  key: string;
  id: number;
  name: string;
  brand: string;
  imageUrl?: string;
  scannedAt: number;
}

/**
 * 스캔 기록. 로그인 상태면 서버 기록(`GET /me/scans`, 최신순),
 * 비회원이면 화장대에서 스캔으로 등록된 항목.
 *
 * 스캔 화면의 '최근 스캔'과 '전체보기'(ScanHistoryPage)가 같이 쓴다.
 */
export function useScanHistory() {
  const { isUser } = useAuth();
  const { items: closetItems } = useCloset();
  const [serverScans, setServerScans] = useState<ScanDto[] | null>(null);

  useEffect(() => {
    if (!isUser) return;
    let alive = true;
    fetchScans()
      .then((s) => {
        if (alive) setServerScans(s);
      })
      .catch(() => {
        if (alive) setServerScans([]);
      });
    return () => {
      alive = false;
    };
  }, [isUser]);

  const items: ScanHistoryItem[] = isUser
    ? (serverScans ?? [])
        .filter((s) => s.product !== null)
        .map((s) => ({
          key: `scan-${s.id}`,
          id: s.product!.id,
          name: s.product!.name,
          brand: s.product!.brand,
          imageUrl: s.product!.imageUrl,
          scannedAt: new Date(s.createdAt).getTime(),
        }))
    : closetItems
        .filter((c) => c.addedVia === 'scan')
        .map((c) => ({
          key: `closet-${c.id}`,
          id: c.id,
          name: c.name,
          brand: c.brand,
          imageUrl: c.imageUrl,
          scannedAt: c.addedAt,
        }));

  return { items, loading: isUser && serverScans === null };
}
