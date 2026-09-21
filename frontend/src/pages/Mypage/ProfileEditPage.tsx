import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useUserProfile } from '../../context/userProfile';

const MAX_LEN = 12;

// TODO: 프로필 수정 API 연동 전까지 Context(localStorage)에만 저장. 저장 시 이전 화면으로 복귀.
export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useUserProfile();
  const [nickname, setNickname] = useState(profile.nickname);
  const trimmed = nickname.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= MAX_LEN;

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="프로필 편집" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <div className="rounded-2xl bg-white border border-[#ECEEE8] overflow-hidden">
          <div className="px-4 pt-4 pb-4">
            <label className="block text-[13px] font-bold text-gray-100">닉네임</label>
            <div className="mt-2 flex items-center rounded-xl border border-gray-20 px-3.5 focus-within:border-primary">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, MAX_LEN))}
                placeholder="2~12자"
                className="h-12 flex-1 bg-transparent text-[14px] font-semibold text-primary-dark outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/mypage/settings/email')}
            className="flex w-full items-center justify-between border-t border-[#F1F2ED] px-4 py-4 text-left active:bg-[#F7F8F4]"
          >
            <span className="text-[13px] font-bold text-gray-100">이메일</span>
            <span className="flex items-center gap-1 text-[13px] font-medium text-primary-dark">
              {profile.email}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke="#2B6B52" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        <p className="mt-2 ml-1 text-[12px] text-gray-50">닉네임은 2~12자로 입력해 주세요.</p>

        <div className="mt-auto pt-8 pb-[var(--safe-bottom)]">
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              updateProfile({ nickname: trimmed });
              navigate(-1);
            }}
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary-dark text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-50"
          >
            저장하기
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
