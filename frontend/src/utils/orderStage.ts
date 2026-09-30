/**
 * 주문 단계 표시. 단계 자체는 서버가 계산한다(`services/order_stage.py`) —
 * 화면은 이름과 색만 정한다.
 */
export const STAGE_LABEL: Record<string, string> = {
  paid: '결제완료',
  preparing: '배송준비중',
  shipping: '배송중',
  delivered: '배송완료',
  cancelled: '주문취소',
  returned: '반품완료',
};

export const STAGE_BADGE: Record<string, string> = {
  paid: 'bg-primary text-white',
  preparing: 'bg-[#FFF3DC] text-[#C77700]',
  shipping: 'bg-[#E6F0FF] text-[#2F6FD6]',
  delivered: 'bg-primary-light text-primary-dark',
  cancelled: 'bg-gray-10 text-gray-70',
  returned: 'bg-gray-10 text-gray-70',
};

/** 취소·반품 시 고르는 사유. 고르지 않아도 된다. */
export const CANCEL_REASONS = ['단순 변심', '다른 상품으로 다시 주문', '배송이 늦어요', '기타'];
export const RETURN_REASONS = ['단순 변심', '상품 불량·파손', '주문과 다른 상품', '피부에 맞지 않아요', '기타'];

export const isClosed = (status: string) => status === 'cancelled' || status === 'returned';

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
