import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useUserProfile } from '../../context/userProfile';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// TODO: 실제 이메일 변경 API 연동 전까지 Context(localStorage)에만 저장.
export default function EmailChangePage() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useUserProfile();
  const [email, setEmail] = useState(profile.email ?? '');
  const [password, setPassword] = useState('');

  const trimmed = email.trim();
  const validFormat = EMAIL_RE.test(trimmed);
  const isDifferent = trimmed !== (profile.email ?? '');
  const valid = validFormat && isDifferent && password.length > 0;

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="이메일 변경" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <label className="block text-[13px] font-bold text-gray-100">새 이메일</label>
        <div className="mt-2 flex items-center rounded-xl border border-gray-20 bg-white px-3.5 focus-within:border-primary">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            className="h-12 flex-1 bg-transparent text-[14px] text-gray-100 outline-none"
          />
        </div>

        <label className="mt-6 block text-[13px] font-bold text-gray-100">현재 비밀번호</label>
        <div className="mt-2 flex items-center rounded-xl border border-gray-20 bg-white px-3.5 focus-within:border-primary">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="본인 확인을 위해 입력해 주세요"
            className="h-12 flex-1 bg-transparent text-[14px] text-gray-100 outline-none placeholder:text-gray-50"
          />
        </div>

        <ul className="mt-3 space-y-1">
          <li className="text-[12px] text-gray-50">· 올바른 이메일 형식</li>
          <li className="text-[12px] text-gray-50">· 기존 이메일과 다른 주소</li>
        </ul>

        <div className="mt-auto pt-8 pb-[var(--safe-bottom)]">
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              updateProfile({ email: trimmed });
              navigate(-1);
            }}
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary-dark text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-50"
          >
            이메일 변경
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
