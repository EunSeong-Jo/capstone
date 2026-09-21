// 알림 목업 (가격 인하 · 재진단 추천 · 재입고 · 적립 · 공지)
// TODO: 실제 알림 API 연동 전까지 목데이터

export interface NotificationItem {
  id: number;
  icon: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: 1,
    icon: '💰',
    title: '찜한 상품 가격이 내려갔어요',
    body: '라운드랩 1025 독도 토너 200ml · 21,000원 → 18,900원 (-10%)',
    time: '방금 전',
    unread: true,
  },
  {
    id: 2,
    icon: '🧪',
    title: '피부타입 재진단을 추천해요',
    body: '마지막 진단으로부터 3개월이 지났어요. 계절이 바뀌면 피부도 달라져요!',
    time: '2시간 전',
    unread: true,
  },
  {
    id: 3,
    icon: '📦',
    title: '재입고 알림 신청한 상품이 들어왔어요',
    body: '에스트라 아토베리어365 크림 80ml, 지금 구매 가능해요.',
    time: '어제',
    unread: false,
  },
  {
    id: 4,
    icon: '⭐',
    title: '재진단 완료 적립 예정',
    body: '300P가 2026.07.01에 지급될 예정이에요.',
    time: '3일 전',
    unread: false,
  },
  {
    id: 5,
    icon: '🔔',
    title: 'swappy 이용약관이 업데이트되었어요',
    body: '개정된 약관은 2026.07.01부터 적용됩니다.',
    time: '1주 전',
    unread: false,
  },
];
