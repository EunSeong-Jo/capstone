import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { SKIN_TYPE_META } from '../../types';

const MENUS = [
  { icon: '❤️', label: '찜한 제품', count: 12 },
  { icon: '👁️', label: '최근 본 제품', count: 24 },
  { icon: '🔬', label: '피부타입 재진단' },
  { icon: '🔔', label: '알림 설정' },
  { icon: '🚪', label: '로그아웃', danger: true },
];

export default function MypagePage() {
  const navigate = useNavigate();
  const skinMeta = SKIN_TYPE_META['ondalsam']; // TODO: 실제 사용자 데이터로 교체

  return (
    <PageWrapper hasBottomNav>
      {/* 상단 프로필 그라디언트 */}
      <div
        className="px-6 pt-10 pb-6"
        style={{ background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)' }}
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
            😊
          </div>
          <div>
            <p className="text-lg font-bold text-white">닉네임</p>
            <p className="text-sm text-white/70">user@email.com</p>
          </div>
        </div>

        {/* 피부타입 카드 */}
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,.15)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{skinMeta.emoji}</span>
            <div>
              <p className="text-xs text-white/70">내 피부타입</p>
              <p className="text-base font-bold text-white">{skinMeta.label}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/qna')}
            className="px-3 py-1 rounded-full text-xs font-semibold text-primary bg-white active:scale-95 transition-transform"
          >
            재진단
          </button>
        </div>
      </div>

      {/* 통계 */}
      <div className="flex border-b border-gray-20">
        {[['찜한 제품', '12'], ['최근 본 제품', '24'], ['검색 횟수', '38']].map(([label, count]) => (
          <div key={label} className="flex-1 flex flex-col items-center py-4">
            <span className="text-xl font-black text-primary">{count}</span>
            <span className="text-xs text-gray-70 mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* 메뉴 */}
      <div className="px-4 py-2">
        {MENUS.map(({ icon, label, count, danger }) => (
          <button
            key={label}
            className="w-full flex items-center justify-between h-14 active:bg-gray-5 transition-colors rounded-lg px-2"
            onClick={() => label === '로그아웃' && navigate('/')}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span
                className="text-base font-medium"
                style={{ color: danger ? 'var(--accent)' : 'var(--text)' }}
              >
                {label}
              </span>
            </div>
            {count !== undefined && (
              <span className="text-sm font-semibold text-primary">{count}</span>
            )}
            {!danger && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="var(--gray50)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
