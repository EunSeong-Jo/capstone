import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

const NOTICES = [
  {
    id: 1,
    title: '개인정보 처리방침 개정 안내',
    date: '2026.06.20',
    body: '개정된 개인정보 처리방침이 2026.07.01부터 적용됩니다. 자세한 내용은 설정 > 개인정보 처리방침에서 확인하실 수 있어요.',
  },
  { id: 2, title: '피부타입 재진단 기능 업데이트', date: '2026.06.12', body: '피부타입 재진단 로직이 더 정교해졌어요. 마이페이지에서 다시 진단해 보세요.' },
  { id: 3, title: '정기 점검 안내 (6/8 02:00~04:00)', date: '2026.06.05', body: '안정적인 서비스 제공을 위해 해당 시간 동안 서비스 이용이 일시 중단됩니다.' },
  { id: 4, title: 'swappy 오픈 안내', date: '2026.05.20', body: 'swappy가 새롭게 오픈했어요. 성분 분석과 대체품 추천을 지금 만나보세요.' },
];

export default function NoticesPage() {
  const [openId, setOpenId] = useState<number | null>(1);

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="공지사항" />

      <div className="bg-white">
        {NOTICES.map((n, i) => {
          const open = openId === n.id;
          return (
            <div key={n.id} className={i < NOTICES.length - 1 ? 'border-b border-gray-10' : ''}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : n.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-[#F7F8F4]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-gray-100">{n.title}</span>
                  <span className="mt-1 block text-xs text-gray-50">{n.date}</span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && (
                <p className="px-4 pb-4 text-[13px] leading-[1.6] text-gray-70">{n.body}</p>
              )}
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
}
