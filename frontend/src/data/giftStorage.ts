import { readJSON, writeJSON } from '../context/storage';

/**
 * 보낸 선물 기록.
 *
 * 실제 결제·배송 API가 없어 GiftComposePage에서 "선물 보내기"를 누르면
 * 여기 localStorage에 한 건 쌓고, 선물함(GiftBoxPage) "보낸 선물" 탭이
 * 이 목록 + 기존 예시 데이터를 합쳐서 보여준다.
 */
const KEY = 'swappy:sentGifts:v1';

export interface SentGift {
  id: number;
  productId: number;
  person: string;
  product: string;
  brand: string;
  date: string;
  status: '수락대기';
  statusClass: string;
  bg: string;
  emoji: string;
  price: string;
}

export function getSentGifts(): SentGift[] {
  return readJSON<SentGift[]>(KEY, []);
}

export function addSentGift(gift: Omit<SentGift, 'id' | 'status' | 'statusClass'>): void {
  const list = getSentGifts();
  const entry: SentGift = {
    ...gift,
    id: Date.now(),
    status: '수락대기',
    statusClass: 'text-orange-500',
  };
  writeJSON(KEY, [entry, ...list]);
}
