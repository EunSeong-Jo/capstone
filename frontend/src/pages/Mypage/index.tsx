import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { SKIN_TYPE_META } from '../../types';
import { useUserProfile } from '../../context/userProfile';
import { useCloset } from '../../context/closet';
import { useLikedProducts } from '../../context/liked';
import { useStats } from '../../hooks/useStats';
import { CartIcon } from '../../components/ui/OutlineIcons';
import { CharacterAvatar } from '../../components/character/CharacterAvatar';
import { useCharacter } from '../../context/character';



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
  const { profile } = useUserProfile();
  const skinMeta = SKIN_TYPE_META[profile.skinType];
  // 서버가 실제 행에서 센 값. 비회원은 null이라 로컬 개수로 대신한다.
  // 레벨·경험치는 무엇으로 오르는지 정한 적이 없어 그리지 않는다.
  const { stats } = useStats();
  const { count: closetCount } = useCloset();
  const { likedProducts } = useLikedProducts();
  const { decorationId } = useCharacter();

  // 취소·반품·배송지·재입고는 뺐다. 실제 결제와 배송이 없어 화면에 채울
  // 근거가 아예 없는 항목들이고, 지금까지는 각자 하드코딩된 예시를 들고
  // 있었다. '보낸 선물'은 gifts 테이블이 생겨 돌아왔다.
  const shopping: MenuItem[] = [
    { icon: <LineIcon><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" /><path d="M4 8l8 4 8-4M12 12v8" /></LineIcon>, label: '주문내역', right: stats ? `${stats.orderCount}건` : undefined, onClick: () => navigate('/mypage/order-history') },
    { icon: <LineIcon><rect x="3" y="8" width="18" height="12.5" rx="1.5" /><path d="M3 12h18M12 8v12.5" /></LineIcon>, label: '장바구니', right: stats ? `${stats.cartCount}개` : undefined, onClick: () => navigate('/cart') },
    { icon: <LineIcon><path d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></LineIcon>, label: '내 화장대', right: `${stats?.closetCount ?? closetCount}개`, onClick: () => navigate('/closet') },
    { icon: <LineIcon><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 6h18v3H3zM12 6v14" /></LineIcon>, label: '보낸 선물', onClick: () => navigate('/mypage/gifts') },
  ];

  const benefits: MenuItem[] = [
    { icon: <LineIcon><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" /></LineIcon>, label: '후기', onClick: () => navigate('/mypage/reviews') },
    { icon: <LineIcon><circle cx="12" cy="12" r="8" /><path d="M9.5 10.5h5M9.5 13.5h5" /></LineIcon>, label: '포인트', right: stats ? `${stats.pointBalance.toLocaleString()}P` : undefined, onClick: () => navigate('/mypage/points') },
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
            <CartIcon size={24} className="text-[#17171C]" />
            <span className="absolute -top-1 -right-1.5 inline-flex min-w-[15px] h-[15px] px-1 items-center justify-center rounded-full bg-primary-dark text-[9px] font-extrabold text-white">2</span>
          </button>
        </div>
      </header>

      {/* 6e 상단 — 프로필 + 피부/레벨 카드 + 통계 바 */}
      <div className="px-4 pt-1">
        {/* 프로필 행 */}
        <div className="flex items-center gap-3.5">
          {/* 프로필 사진도 내 캐릭터다. 예전에는 피부타입과 무관한 범용
              얼굴(base_face_neutral.png)이라 홈의 마스코트와 달랐고, 꾸미기도
              반영되지 않았다. */}
          <button
            type="button"
            onClick={() => navigate('/closet/decorate')}
            aria-label="내 캐릭터 꾸미기"
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#ECEEE8] bg-white shadow-[0_2px_10px_rgba(43,107,82,.08)] transition-transform active:scale-95"
          >
            <CharacterAvatar
              skinType={profile.skinType}
              decorationId={decorationId}
              className="h-[84%] w-[84%]"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-extrabold tracking-[-0.3px] text-gray-100">{profile.nickname}</p>
            <p className="mt-0.5 text-xs text-gray-50">{profile.email}</p>
          </div>
          <button onClick={() => navigate('/mypage/settings')} aria-label="설정" className="active:scale-90 transition-transform">
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
                <p className="mt-px text-[11px] text-gray-50">{skinMeta.summary.split(',')[0]} · {profile.memberSince} 진단</p>
              </div>
            </div>
            <button onClick={() => navigate('/qna')} className="inline-flex items-center h-[30px] px-[13px] rounded-full bg-primary-dark text-[11px] font-extrabold text-white active:scale-95 transition-transform">
              재진단
            </button>
          </div>

          {/* 레벨·경험치. 서버가 기록(스캔·후기·주문·선물)에서 계산한 값이라
              비회원에게는 아예 없다 — 그 경우 줄을 그리지 않는다. */}
          {stats && (
            <div className="mt-3.5 flex items-center gap-3 border-t border-gray-10 pt-3">
              <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-gray-50">
                Lv.{stats.level}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((stats.expInLevel / stats.levelSpan) * 100))}%`,
                  }}
                />
              </div>
              <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-50">
                {stats.expInLevel}/{stats.levelSpan}
              </span>
            </div>
          )}
        </div>

        {/* 통계 바. 전부 GET /me/stats가 실제 행에서 센 값이다. 비회원은
            stats가 null이라 로컬 개수로 대신한다. */}
        <div className="mt-3 flex rounded-[20px] bg-primary-dark">
          {[
            [`${(stats?.closetCount ?? closetCount).toLocaleString()}개`, '내 화장대'],
            [`${(stats?.likeCount ?? likedProducts.length).toLocaleString()}개`, '찜한 제품'],
            [
              stats ? `${stats.pointBalance.toLocaleString()}P` : '—',
              '포인트',
            ],
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
