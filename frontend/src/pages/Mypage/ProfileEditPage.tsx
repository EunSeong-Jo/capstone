import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Button } from '../../components/ui/Button';
import { MOCK_PROFILE } from '../../mocks/home';

const USER_EMAIL = 'user@email.com';
const MAX_LEN = 12;

// TODO: 프로필 수정 API 연동 전까지 로컬 상태만. 저장 시 이전 화면으로 복귀.
export default function ProfileEditPage() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(MOCK_PROFILE.nickname);
  const trimmed = nickname.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= MAX_LEN;

  return (
    <PageWrapper className="bg-white">
      <Header showBack title="프로필 편집" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <div className="flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-surface-warm border border-[#ECEEE8]">
            <img src="/mascot/base_face_neutral.png" alt="프로필" className="h-[84%] w-[84%] object-contain" />
          </div>
          <button
            type="button"
            onClick={() => alert('준비 중이에요')}
            className="mt-2 text-[12px] font-semibold text-primary active:scale-95 transition-transform"
          >
            사진 변경
          </button>
        </div>

        <label className="mt-8 block text-[13px] font-bold text-gray-100">닉네임</label>
        <div className="mt-2 flex items-center rounded-xl border border-gray-20 px-3.5 focus-within:border-primary">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, MAX_LEN))}
            placeholder="2~12자"
            className="h-12 flex-1 bg-transparent text-[14px] text-gray-100 outline-none"
          />
          <span className="text-[11px] text-gray-50">{trimmed.length}/{MAX_LEN}</span>
        </div>
        {!valid && trimmed.length > 0 && (
          <p className="mt-1.5 text-[11px] text-[#FF5C7A]">닉네임은 2~12자로 입력해 주세요.</p>
        )}

        <label className="mt-6 block text-[13px] font-bold text-gray-100">이메일</label>
        <div className="mt-2 flex h-12 items-center rounded-xl bg-surface-warm px-3.5 text-[14px] text-gray-50">
          {USER_EMAIL}
        </div>

        <div className="mt-auto pt-8">
          <Button
            variant="next"
            disabled={!valid}
            onClick={() => {
              MOCK_PROFILE.nickname = trimmed;
              navigate(-1);
            }}
          >
            저장
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
