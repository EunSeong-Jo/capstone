import { useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { SKIN_TYPE_META } from '../../types';
import { MOCK_PROFILE, MOCK_CHARACTER } from '../../mocks/home';

// TODO: 실제 사용자 통계 API 연동 전까지 목데이터
const CUMULATIVE = { saved: 128400, scans: 21, swaps: 9 };
const USER_EMAIL = 'user@email.com';

const ScanIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2B6B52" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);
const StarIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2B6B52" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />
  </svg>
);
const BoxIconGreen = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2B6B52" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" />
    <path d="M4 8l8 4 8-4M12 12v8" />
  </svg>
);

const EXP_GUIDE: { icon: ReactNode; label: string; exp: number }[] = [
  { icon: ScanIcon, label: '성분 스캔 1회', exp: 10 },
  { icon: StarIcon, label: '후기 작성', exp: 20 },
  { icon: BoxIconGreen, label: '제품 주문', exp: 50 },
];

interface MenuItem {
  icon: ReactNode;
  label: string;
  right?: string;
  danger?: boolean;
  onClick: () => void;
}

/** 회색 라인 메뉴 아이콘 (stroke=#6B7280) */
function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function GroupCard({ title, items }: { title: string; items: MenuItem[] }) {
  return (
    <div className="px-4 pt-4">
      <p className="mb-2 ml-1 text-xs font-bold text-gray-50">{title}</p>
      <div className="rounded-[20px] bg-white border border-[#ECEEE8] px-4">
        {items.map((m, i) => (
          <button
            key={m.label}
            onClick={m.onClick}
            className={`flex w-full items-center gap-3 h-[50px] text-left ${
              i < items.length - 1 ? 'border-b border-surface-warm' : ''
            }`}
          >
            {m.icon}
            <span className={`flex-1 text-sm font-medium ${m.danger ? 'text-accent' : 'text-gray-100'}`}>{m.label}</span>
            {m.right && <span className="text-[13px] font-bold text-primary">{m.right}</span>}
            {!m.danger && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="#C3C8CE" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MypagePage() {
  const navigate = useNavigate();
  const [expOpen, setExpOpen] = useState(true);
  const skinMeta = SKIN_TYPE_META[MOCK_PROFILE.skinType];
  const { level, exp, nextLevelExp, title } = MOCK_CHARACTER;
  const expPct = Math.min(100, Math.round((exp / nextLevelExp) * 100));

  const shopping: MenuItem[] = [
    { icon: <LineIcon><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" /><path d="M4 8l8 4 8-4M12 12v8" /></LineIcon>, label: '주문내역', onClick: () => navigate('/mypage/order-history') },
    { icon: <LineIcon><path d="M4 12a8 8 0 108-8" /><path d="M4 4v5h5" /></LineIcon>, label: '취소 · 반품 · 교환', onClick: () => navigate('/mypage/cancel-return') },
    { icon: <LineIcon><path d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></LineIcon>, label: '배송지 관리', onClick: () => navigate('/mypage/shipping') },
    { icon: <LineIcon><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></LineIcon>, label: '재입고 알림', right: '2', onClick: () => navigate('/mypage/restock') },
  ];

  const benefits: MenuItem[] = [
    { icon: <LineIcon><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" /></LineIcon>, label: '후기', right: '1,200P', onClick: () => navigate('/mypage/reviews') },
    { icon: <LineIcon><rect x="3" y="8" width="18" height="12.5" rx="1.5" /><path d="M3 12h18M12 8v12.5" /><path d="M12 8c-1-2.5-2.6-4-4-3s-.4 3 4 3zM12 8c1-2.5 2.6-4 4-3s.4 3-4 3z" /></LineIcon>, label: '선물함', onClick: () => navigate('/mypage/giftbox') },
    { icon: <LineIcon><path d="M5 13a7 7 0 0114 0" /><rect x="4" y="13" width="3.5" height="6" rx="1.5" /><rect x="16.5" y="13" width="3.5" height="6" rx="1.5" /></LineIcon>, label: '고객센터', onClick: () => navigate('/mypage/customer-service') },
  ];

  const settings: MenuItem[] = [
    { icon: <LineIcon><path d="M10 3v6l-5 8.5A2 2 0 006.7 21h10.6a2 2 0 001.7-3.5L14 9V3" /><path d="M8.5 3h7" /></LineIcon>, label: '피부타입 재진단', onClick: () => navigate('/qna') },
    { icon: <LineIcon><rect x="3" y="7" width="18" height="10" rx="5" /><circle cx="16" cy="12" r="3" /></LineIcon>, label: '알림 설정', onClick: () => alert('준비 중이에요') },
    { icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FF5C7A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H6a2 2 0 00-2 2v10a2 2 0 002 2h3" /><path d="M15 8l4 4-4 4M19 12H9" /></svg>, label: '로그아웃', danger: true, onClick: () => navigate('/') },
  ];

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center justify-between h-[52px] px-4 bg-surface-warm">
        <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-gray-100">마이</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/search')} aria-label="검색" className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#17171C" strokeWidth="1.8" />
              <path d="M16.5 16.5L21 21" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button onClick={() => alert('준비 중이에요')} aria-label="알림" className="relative active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M6 8h12l-.9 11.2a1.8 1.8 0 01-1.8 1.65H8.7a1.8 1.8 0 01-1.8-1.65L6 8z" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="absolute -top-1 -right-1.5 inline-flex min-w-[15px] h-[15px] px-1 items-center justify-center rounded-full bg-primary-dark text-[9px] font-extrabold text-white">2</span>
          </button>
        </div>
      </header>

      {/* 6e 상단 — 프로필 + 피부/레벨 카드 + 통계 바 */}
      <div className="px-4 pt-1">
        {/* 프로필 행 */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white border border-[#ECEEE8] shadow-[0_2px_10px_rgba(43,107,82,.08)]">
            <img src="/mascot/base_face_neutral.png" alt="프로필" className="h-[84%] w-[84%] object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[19px] font-extrabold tracking-[-0.3px] text-gray-100">{MOCK_PROFILE.nickname}</p>
              <span className="inline-flex items-center h-5 px-2 rounded-full bg-primary-light text-[10px] font-extrabold text-primary-dark">
                Lv.{level} {title}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-50">{USER_EMAIL}</p>
          </div>
          <button onClick={() => alert('준비 중이에요')} aria-label="설정" className="active:scale-90 transition-transform">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A8F98" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* 피부타입 · 레벨 카드 */}
        <div className="mt-4 rounded-[20px] bg-white border border-[#ECEEE8] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-[22px]">{skinMeta.emoji}</span>
              <div>
                <p className="text-[15px] font-extrabold text-gray-100">{skinMeta.label}</p>
                <p className="mt-px text-[11px] text-gray-50">{skinMeta.summary.split(',')[0]} · {MOCK_PROFILE.memberSince} 진단</p>
              </div>
            </div>
            <button onClick={() => navigate('/qna')} className="inline-flex items-center h-[30px] px-[13px] rounded-full bg-primary-dark text-[11px] font-extrabold text-white active:scale-95 transition-transform">
              재진단
            </button>
          </div>

          {/* 레벨 진행 + 자세히보기 */}
          <div className="mt-3 pt-3 flex items-center gap-2.5 border-t border-surface-warm">
            <span className="whitespace-nowrap text-[11px] font-bold text-gray-50">Lv.{level}</span>
            <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#F0F1F3]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${expPct}%` }} />
            </div>
            <span className="whitespace-nowrap text-[10px] text-gray-50">{exp}/{nextLevelExp}</span>
            <button
              onClick={() => setExpOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 h-6 px-2.5 rounded-full border border-[#DCE8E1] text-[10px] font-extrabold text-primary-dark"
            >
              자세히보기
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className={`transition-transform ${expOpen ? '' : 'rotate-180'}`}>
                <path d="M6 9l6 6 6-6" stroke="#2B6B52" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* 경험치 가이드 */}
          {expOpen && (
            <div className="mt-2.5 rounded-xl bg-surface-warm px-3">
              {EXP_GUIDE.map((g, i) => (
                <div
                  key={g.label}
                  className={`flex items-center gap-2.5 py-2.5 ${i < EXP_GUIDE.length - 1 ? 'border-b border-[#EAECE6]' : ''}`}
                >
                  {g.icon}
                  <span className="flex-1 text-xs font-medium text-gray-70">{g.label}</span>
                  <span className="text-xs font-extrabold text-primary-dark">+{g.exp} EXP</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 통계 바 (누적 절약 / 성분 스캔 / 교체 성공) */}
        <div className="mt-3 flex rounded-[20px] bg-primary-dark">
          {[
            [`${CUMULATIVE.saved.toLocaleString()}원`, '누적 절약'],
            [`${CUMULATIVE.scans}회`, '성분 스캔'],
            [`${CUMULATIVE.swaps}회`, '교체 성공'],
          ].map(([value, label], i) => (
            <div key={label} className="relative flex flex-1 flex-col items-center py-[15px]">
              {i > 0 && <span className="absolute left-0 top-[13px] bottom-[13px] w-px bg-white/[0.14]" />}
              <span className="text-base font-black text-white">{value}</span>
              <span className="mt-0.5 text-[10px] text-white/65">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5b 하단 — 그룹 메뉴 카드 */}
      <GroupCard title="쇼핑 활동" items={shopping} />
      <GroupCard title="혜택 · 지원" items={benefits} />
      <div className="pb-6">
        <GroupCard title="설정" items={settings} />
      </div>

      <OyBottomNav />
    </PageWrapper>
  );
}
