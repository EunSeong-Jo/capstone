import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Button } from '../../components/ui/Button';
import { updateMe } from '../../api/auth';
import { useAuth } from '../../context/auth';
import { useUserProfile } from '../../context/userProfile';

const MAX_LEN = 12;

/**
 * 프로필 편집.
 *
 * 로그인 상태면 서버에 저장한다(PATCH /api/v1/me). 비회원은 localStorage에만
 * 남는데, 저장할 계정이 없으니 그게 맞다.
 *
 * 서버 저장이 실패하면 화면에 알리고 이동하지 않는다. 예전처럼 조용히
 * 넘어가면 다음 새로고침에 되돌아가 있는 것처럼 보인다.
 */
export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useUserProfile();
  const { isUser } = useAuth();
  const [nickname, setNickname] = useState(profile.nickname);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = nickname.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= MAX_LEN;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    if (isUser) {
      const ok = await updateMe(trimmed)
        .then(() => true)
        .catch(() => false);
      if (!ok) {
        setSaving(false);
        setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
    }

    updateProfile({ nickname: trimmed });
    setSaving(false);
    navigate(-1);
  };

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
          {profile.email}
        </div>

        {/* 하단 네비가 없는 페이지라 PageWrapper가 하단 인셋을 넣지 않는다. 홈 인디케이터에 가리지 않도록 직접 확보 */}
        <div className="mt-auto pt-8 pb-[var(--safe-bottom)]">
          {error && (
            <p className="mb-2 text-center text-[12px] text-[#FF5C7A]">{error}</p>
          )}
          <Button variant="next" disabled={!valid || saving} onClick={save}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>
    </PageWrapper>
  );
}
