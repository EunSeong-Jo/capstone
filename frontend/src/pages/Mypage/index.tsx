import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { SKIN_TYPE_META, UNKNOWN_SKIN_META } from '../../types';
import { useUserProfile } from '../../context/userProfile';
import { useCloset } from '../../context/closet';
import { useLikedProducts } from '../../context/liked';
import { useStats } from '../../hooks/useStats';
import { useQuota, useSubscription } from '../../hooks/useSkinPhoto';
import MembershipManager from '../../components/membership/MembershipManager';
import { CartButton } from '../../components/ui/CartButton';
import { CharacterAvatar } from '../../components/character/CharacterAvatar';
import { useCharacter } from '../../context/character';
import { useAuth } from '../../context/auth';
import { useDiagnosis } from '../../context/diagnosis';
import { useSkinType } from '../../hooks/useSkinType';



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

/**
 * 경험치 규칙 안내. 값은 서버(`backend/app/services/experience.py`)와 같아야 한다 —
 * 레벨 계산은 서버가 하고, 여기는 무엇으로 오르는지 보여 줄 뿐이다.
 */
const EXP_RULES: { key: 'scanCount' | 'reviewCount' | 'orderCount' | 'giftCount'; label: string; exp: number; hint: string }[] = [
  { key: 'orderCount', label: '주문하기', exp: 50, hint: '취소·반품하면 빠져요' },
  { key: 'reviewCount', label: '후기 쓰기', exp: 20, hint: '구매한 제품에 한 번씩' },
  { key: 'giftCount', label: '선물 보내기', exp: 20, hint: '친구 닉네임으로 보내기' },
  { key: 'scanCount', label: '제품 스캔·등록', exp: 10, hint: '스캔 화면에서 화장대에 담기' },
];

export default function MypagePage() {
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  /**
   * 진단 전에는 8종 중 하나를 골라 보여주지 않는다 — 그게 곧 거짓이 된다.
   * 요약 문구와 '재진단' 버튼도 그 상태에 맞게 바뀐다.
   *
   * 피부타입은 홈과 같은 useSkinType에서 읽는다. 예전에는 profile.skinType
   * (로그인 시점의 계정 값)을 봐서, 문답 진단을 새로 하면 홈 캐릭터는
   * 바뀌는데 여기 프로필 캐릭터는 그대로였다.
   */
  const { skinType, loading: skinPending } = useSkinType();
  const { result: diagnosis } = useDiagnosis();
  const diagnosed = skinType !== null;
  const skinMeta = diagnosed ? SKIN_TYPE_META[skinType] : UNKNOWN_SKIN_META;
  // 진단일. 진단 기록이 없는 시드 계정만 가입 월로 대신한다.
  const diagnosedOn = diagnosis
    ? new Date(diagnosis.ts).toLocaleDateString('ko-KR').replace(/\.\s?/g, '.').replace(/\.$/, '')
    : profile.memberSince;
  // 서버가 실제 행에서 센 값. 비회원은 null이라 로컬 개수로 대신한다.
  const { stats, loading: statsLoading } = useStats();
  // AI 피부관리 메뉴에 남은 횟수를 보여 준다. 동의 전에는 '시작하기'가 나온다(동의는 촬영할 때 받는다).
  const { quota, reload: reloadQuota } = useQuota();
  const { subscription } = useSubscription();
  const [membershipOpen, setMembershipOpen] = useState(false);
  const { count: closetCount } = useCloset();
  const { likedProducts } = useLikedProducts();
  const { decorationId } = useCharacter();
  const [expGuideOpen, setExpGuideOpen] = useState(false);
  const { logout, isUser } = useAuth();

  /**
   * 예전에는 `navigate('/')`만 했다 — **세션이 그대로 남아** 토큰도 계정
   * 정보도 살아 있었고, 스플래시를 지나 홈으로 돌아오면 여전히 로그인
   * 상태였다. 로그아웃은 화면 이동이 아니라 세션 종료다.
   */
  const signOut = () => {
    logout();
    navigate('/');
  };

  // 배송지·재입고는 뺐다. 실제 배송이 없어 화면에 채울 근거가 없다.
  // 주문내역 목록은 취소·반품한 주문도 함께 보여 주므로 개수도 둘을 더한다(orderCount는 취소·반품을 뺀 값).
  // 취소·반품은 orders.status 기록이 생겨 돌아왔다(배송 단계는 서버가 계산).
  // '보낸/받은 선물'은 gifts 테이블에서 온다.
  const shopping: MenuItem[] = [
    { icon: <LineIcon><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" /><path d="M4 8l8 4 8-4M12 12v8" /></LineIcon>, label: '주문내역', right: stats ? `${stats.orderCount + stats.cancelReturnCount}건` : undefined, onClick: () => navigate('/mypage/order-history') },
    { icon: <LineIcon><path d="M9 14l-4-4 4-4" /><path d="M5 10h10a4 4 0 010 8h-2" /></LineIcon>, label: '취소/반품/환불 내역', right: stats ? `${stats.cancelReturnCount}건` : undefined, onClick: () => navigate('/mypage/cancel-return') },
    { icon: <LineIcon><rect x="3" y="8" width="18" height="12.5" rx="1.5" /><path d="M3 12h18M12 8v12.5" /></LineIcon>, label: '장바구니', right: stats ? `${stats.cartCount}개` : undefined, onClick: () => navigate('/cart') },
    { icon: <LineIcon><path d="M9.5 3h5v3h-5z" /><path d="M8 6h8v13.5a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 018 19.5V6z" /><path d="M8 11h8" /></LineIcon>, label: '내 화장대', right: `${stats?.closetCount ?? closetCount}개`, onClick: () => navigate('/closet') },
    { icon: <LineIcon><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 6h18v3H3zM12 6v14" /></LineIcon>, label: '보낸/받은 선물', right: stats ? `보낸 ${stats.giftCount} · 받은 ${stats.receivedGiftCount}` : undefined, onClick: () => navigate('/mypage/gifts') },
  ];

  const benefits: MenuItem[] = [
    { icon: <LineIcon><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" /></LineIcon>, label: '후기', right: stats ? `작성 가능 ${stats.reviewableCount}개` : undefined, onClick: () => navigate('/mypage/reviews') },
    { icon: <LineIcon><path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z" /></LineIcon>, label: '구독 관리', right: subscription ? (subscription.active ? (subscription.status === 'cancelled' ? '해지 예정' : '구독 중') : '미구독') : undefined, onClick: () => setMembershipOpen(true) },
    { icon: <LineIcon><circle cx="12" cy="12" r="8" /><path d="M9.5 10.5h5M9.5 13.5h5" /></LineIcon>, label: '포인트', right: stats ? `${stats.pointBalance.toLocaleString()}P` : undefined, onClick: () => navigate('/mypage/points') },
    { icon: <LineIcon><path d="M5 13a7 7 0 0114 0" /><rect x="4" y="13" width="3.5" height="6" rx="1.5" /><rect x="16.5" y="13" width="3.5" height="6" rx="1.5" /></LineIcon>, label: '고객센터', onClick: () => navigate('/mypage/customer-service') },
  ];

  const settings: MenuItem[] = [
    { icon: <LineIcon><path d="M10 3v6l-5 8.5A2 2 0 006.7 21h10.6a2 2 0 001.7-3.5L14 9V3" /><path d="M8.5 3h7" /></LineIcon>, label: '피부타입 재진단', onClick: () => navigate('/qna') },
    { icon: <LineIcon><rect x="3" y="7" width="18" height="10" rx="5" /><circle cx="16" cy="12" r="3" /></LineIcon>, label: '알림 설정', onClick: () => alert('준비 중이에요') },
    { icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FF5C7A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H6a2 2 0 00-2 2v10a2 2 0 002 2h3" /><path d="M15 8l4 4-4 4M19 12H9" /></svg>, label: '로그아웃', danger: true, onClick: signOut },
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
          <CartButton />
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
            {skinPending ? (
              // 진단 조회 전에 범용 얼굴을 먼저 그리면 곧바로 바뀌며 깜빡인다.
              <span aria-hidden className="h-[84%] w-[84%] animate-pulse rounded-full bg-gray-10" />
            ) : (
              <CharacterAvatar
                skinType={skinType}
                decorationId={decorationId}
                className="h-[84%] w-[84%]"
              />
            )}
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
                <p className="mt-px text-[11px] text-gray-50">
                  {diagnosed
                    ? `${SKIN_TYPE_META[skinType].summary.split(',')[0]}${diagnosedOn ? ` · ${diagnosedOn} 진단` : ''}`
                    : '아직 진단하지 않았어요'}
                </p>
              </div>
            </div>
            <button onClick={() => navigate('/qna')} className="inline-flex items-center h-[30px] px-[13px] rounded-full bg-primary-dark text-[11px] font-extrabold text-white active:scale-95 transition-transform">
              {diagnosed ? '재진단' : '진단하기'}
            </button>
          </div>

          {/* 레벨·경험치. 서버가 기록(스캔·후기·주문·선물)에서 계산한 값이라
              비회원에게는 아예 없다 — 그 경우 줄을 그리지 않는다. 로그인
              사용자는 값이 곧 오므로 자리만 먼저 잡아 둔다. */}
          {!stats && statsLoading && (
            <div className="mt-3.5 flex items-center gap-3 border-t border-gray-10 pt-3" aria-hidden>
              <span className="h-3 w-8 shrink-0 animate-pulse rounded-full bg-gray-10" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-10" />
              <span className="h-3 w-8 shrink-0 animate-pulse rounded-full bg-gray-10" />
            </div>
          )}
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
              <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-50">
                {stats.expInLevel}/{stats.levelSpan}
              </span>
            </div>
          )}

          {/* 경험치 얻는 법 — 접었다 펼 수 있다 */}
          {stats && (
            <>
              <button
                type="button"
                onClick={() => setExpGuideOpen((v) => !v)}
                aria-expanded={expGuideOpen}
                className="mt-2.5 flex w-full items-center justify-between rounded-xl bg-surface-warm px-3 py-2 text-left active:opacity-70"
              >
                <span className="text-[12px] font-bold text-gray-70">
                  다음 레벨까지 {Math.max(0, stats.levelSpan - stats.expInLevel)} EXP
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`shrink-0 transition-transform duration-200 ${expGuideOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" stroke="#8A8F98" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-300 ${expGuideOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="overflow-hidden">
                  <ul className="mt-2 divide-y divide-gray-10 rounded-xl border border-gray-10">
                    {EXP_RULES.map((r) => {
                      const count = stats[r.key];
                      return (
                        <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-gray-100">{r.label}</span>
                            <span className="block text-[11px] text-gray-50">{r.hint}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[13px] font-extrabold text-primary-dark">+{r.exp} EXP</span>
                            <span className="block text-[11px] text-gray-50">
                              {count}회 · {(count * r.exp).toLocaleString()} EXP 획득
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                </div>
              </div>
            </>
          )}
        </div>

        {/* AI 피부관리 — 피부타입 카드와 통계 바 사이(AI 기능 묶음). 남은 횟수는 동의 전이면 '시작하기'. */}
        <div className="mt-3 overflow-hidden rounded-[20px] border border-[#ECEEE8] bg-white">
          <button
            type="button"
            onClick={() => navigate('/mypage/subscription')}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-[#F7F8F4]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ob-surface">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B6B52" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="11" r="6.5" />
                <path d="M9.5 10h.01M14.5 10h.01M9.5 13.5c1.5 1.4 3.5 1.4 5 0" />
                <path d="M5 5l1.5 1.5M19 5l-1.5 1.5" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-extrabold text-gray-100">AI 피부관리</span>
              <span className="mt-px block text-[11px] text-gray-50">얼굴 사진으로 내 피부 상태를 확인해요</span>
            </span>
            <span className="shrink-0 text-[12px] font-bold text-primary-dark">
              {quota ? (quota.consentGranted ? `${quota.remaining}회 남음` : '시작하기') : ''}
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path d="M9 6l6 6-6 6" stroke="#C7CBD1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {isUser && (
            <button
              type="button"
              onClick={() => navigate('/mypage/ai-me')}
              className="flex w-full items-center gap-3 border-t border-gray-10 px-4 py-3.5 text-left active:bg-[#F7F8F4]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ob-surface">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B6B52" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold text-gray-100">AI가 기억하는 나</span>
                <span className="mt-px block text-[11px] text-gray-50">취향 성분과 챗봇이 기억한 정보</span>
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path d="M9 6l6 6-6 6" stroke="#C7CBD1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
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
              <span className="mt-0.5 text-[11px] text-white/65">{label}</span>
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

      {membershipOpen && <MembershipManager onClose={() => setMembershipOpen(false)} onChanged={reloadQuota} />}

      <OyBottomNav />
    </PageWrapper>
  );
}
