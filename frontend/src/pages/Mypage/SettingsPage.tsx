import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useUserProfile } from '../../context/userProfile';
import { useToast } from '../../components/ui/ToastContext';

const APP_VERSION = '0.1.0';

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
  /** onClick이 있어도 화살표를 감추고 싶을 때(예: 회원 탈퇴) */
  noChevron?: boolean;
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
            {r.right ?? (r.onClick && !r.noChevron && (
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
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const [pushNoti, setPushNoti] = useState(true);
  const [marketingNoti, setMarketingNoti] = useState(false);
  const [nightNoti, setNightNoti] = useState(false);

  const toggleWithToast = (
    label: string,
    setter: (v: boolean) => void,
  ) => (v: boolean) => {
    setter(v);
    showToast(`${label}을(를) ${v ? '동의했어요' : '거절했어요'}`);
  };

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="설정" />

      <Section
        title="계정"
        rows={[
          { label: '프로필 편집', onClick: () => navigate('/mypage/settings/profile') },
          { label: '이메일', right: <span className="text-[13px] text-gray-50">{profile.email}</span> },
          { label: '비밀번호 변경', onClick: () => navigate('/mypage/settings/password') },
        ]}
      />

      <Section
        title="알림"
        rows={[
          {
            label: '푸시 알림',
            right: <Toggle on={pushNoti} onChange={toggleWithToast('푸시 알림', setPushNoti)} />,
          },
          {
            label: '마케팅 정보 수신',
            right: (
              <Toggle
                on={marketingNoti}
                onChange={toggleWithToast('마케팅 정보 수신', setMarketingNoti)}
              />
            ),
          },
          {
            label: '야간 알림(21시~08시)',
            right: <Toggle on={nightNoti} onChange={toggleWithToast('야간 알림', setNightNoti)} />,
          },
        ]}
      />

      <Section
        title="이용 정보"
        rows={[
          { label: '공지사항', onClick: () => navigate('/mypage/settings/notices') },
          { label: '고객센터', onClick: () => navigate('/mypage/customer-service') },
          { label: '이용약관', onClick: () => navigate('/mypage/settings/terms') },
          { label: '개인정보 처리방침', onClick: () => navigate('/mypage/settings/privacy') },
          { label: '버전 정보', right: <span className="text-[13px] text-gray-50">v{APP_VERSION} (최신)</span> },
        ]}
      />

      <Section
        title="기타"
        rows={[
          { label: '로그아웃', onClick: () => navigate('/') },
          { label: '회원 탈퇴', danger: true, noChevron: true, onClick: () => navigate('/mypage/settings/withdraw') },
        ]}
      />

      <div className="h-8" />
    </PageWrapper>
  );
}
