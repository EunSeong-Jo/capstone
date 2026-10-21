import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useUserProfile } from '../../context/userProfile';
import { useAuth } from '../../context/auth';
import { useQuota } from '../../hooks/useSkinPhoto';

const APP_VERSION = '1.0.0';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? 'var(--primary)' : 'var(--gray20)' }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-all"
        style={{ left: on ? '21px' : '3px' }}
      />
    </button>
  );
}

interface Row {
  label: string;
  sub?: string;
  right?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="mt-4">
      <p className="px-4 pb-1.5 text-[12px] font-bold text-gray-50">{title}</p>
      <div className="mx-4 overflow-hidden rounded-[16px] bg-white border border-[#ECEEE8]">
        {rows.map((r, i) => (
          <button
            key={r.label}
            type="button"
            onClick={r.onClick}
            disabled={!r.onClick && !r.right}
            className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left ${
              i > 0 ? 'border-t border-[#F1F2ED]' : ''
            } ${r.onClick ? 'active:bg-[#F7F8F4]' : ''}`}
          >
            <span className="min-w-0">
              <span
                className={`block text-[14px] ${r.danger ? 'font-semibold text-[#FF5C7A]' : 'text-gray-100'}`}
              >
                {r.label}
              </span>
              {r.sub && <span className="mt-0.5 block text-[12px] text-gray-50">{r.sub}</span>}
            </span>
            {r.right ?? (r.onClick && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path d="M9 6l6 6-6 6" stroke="#C7CBD1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ))}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout, isUser } = useAuth();
  const { quota } = useQuota();

  /**
   * 예전에는 `navigate('/')`만 했다 — **세션이 그대로 남아** 토큰도 계정
   * 정보도 살아 있었다. 로그아웃은 화면 이동이 아니라 세션 종료다.
   */
  const signOut = () => {
    logout();
    navigate('/');
  };
  const { profile } = useUserProfile();
  const [pushNoti, setPushNoti] = useState(true);
  const [marketingNoti, setMarketingNoti] = useState(false);

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="설정" />

      <Section
        title="계정"
        rows={[
          { label: profile.nickname, sub: profile.email },
          { label: '프로필 편집', onClick: () => navigate('/mypage/settings/profile') },
          { label: '이메일 변경', onClick: () => navigate('/mypage/settings/email') },
          { label: '비밀번호 변경', onClick: () => navigate('/mypage/settings/password') },
          { label: '피부타입 재진단', onClick: () => navigate('/qna') },
        ]}
      />

      {isUser && (
        <Section
          title="개인정보"
          rows={[
            {
              label: '얼굴 사진 수집·이용 동의',
              sub: quota ? (quota.consentGranted ? '동의함 · 철회할 수 있어요' : '동의하지 않음') : undefined,
              onClick: () => navigate('/mypage/settings/face-consent'),
            },
          ]}
        />
      )}

      <Section
        title="알림"
        rows={[
          {
            label: '푸시 알림',
            sub: '재입고·주문 상태 알림',
            right: <Toggle on={pushNoti} onChange={setPushNoti} />,
          },
          {
            label: '마케팅 알림',
            sub: '혜택·이벤트 소식',
            right: <Toggle on={marketingNoti} onChange={setMarketingNoti} />,
          },
        ]}
      />

      <Section
        title="약관 및 정보"
        rows={[
          { label: '공지사항', onClick: () => navigate('/mypage/settings/notices') },
          { label: '서비스 이용약관', onClick: () => navigate('/mypage/settings/terms') },
          { label: '개인정보 처리방침', onClick: () => navigate('/mypage/settings/privacy') },
          { label: '버전 정보', right: <span className="text-[13px] text-gray-50">v{APP_VERSION}</span> },
        ]}
      />

      <Section
        title="기타"
        rows={[
          { label: '로그아웃', danger: true, onClick: signOut },
          { label: '회원 탈퇴', danger: true, onClick: () => navigate('/mypage/settings/withdraw') },
        ]}
      />

      <div className="h-8" />
    </PageWrapper>
  );
}
