import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';

/**
 * 이메일 가입.
 *
 * `POST /api/v1/auth/signup`이 계정을 만들고 토큰까지 내주므로, 가입에
 * 성공하면 이미 로그인 상태다. 그래서 곧바로 진단으로 보낸다.
 */

/** 서버 규칙(`schemas/user.py: PASSWORD_MIN_LENGTH`)과 같은 값. */
const PASSWORD_MIN = 8;

export default function SignupPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !email.trim() || !pw) {
      setError('닉네임, 이메일, 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('이메일 형식을 확인해 주세요.');
      return;
    }
    if (pw.length < PASSWORD_MIN) {
      setError(`비밀번호는 ${PASSWORD_MIN}자 이상으로 입력해 주세요.`);
      return;
    }
    if (pw !== pwConfirm) {
      setError('비밀번호가 서로 달라요.');
      return;
    }

    setSubmitting(true);
    const r = await register(email, pw, nickname);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? '가입에 실패했어요.');
      return;
    }
    navigate('/onboarding');
  };

  const field =
    'h-[52px] rounded-xl border border-gray-20 bg-white px-4 text-[14px] text-gray-100 outline-none focus:border-primary disabled:opacity-60';

  return (
    <div className="flex min-h-dvh flex-col bg-ob-bg px-7">
      <div className="flex items-center pt-[calc(16px+var(--safe-top))]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="뒤로가기"
          className="transition-transform active:scale-90"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="#1A1A1A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex-[2]" />

      <div className="flex flex-col items-center">
        <p className="text-[22px] font-extrabold text-ob-green-deep">이메일로 가입</p>
        <p className="mt-2 text-[13px] text-gray-50">닉네임과 이메일로 swappy 계정을 만들어요</p>
      </div>

      <form className="mt-8 flex flex-col gap-3" onSubmit={submit}>
        <input
          type="text"
          placeholder="닉네임"
          value={nickname}
          disabled={submitting}
          onChange={(e) => {
            setNickname(e.target.value);
            setError(null);
          }}
          className={field}
        />
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="이메일"
          value={email}
          disabled={submitting}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className={field}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={`비밀번호 (${PASSWORD_MIN}자 이상)`}
          value={pw}
          disabled={submitting}
          onChange={(e) => {
            setPw(e.target.value);
            setError(null);
          }}
          className={field}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호 확인"
          value={pwConfirm}
          disabled={submitting}
          onChange={(e) => {
            setPwConfirm(e.target.value);
            setError(null);
          }}
          className={field}
        />
        {error && <p className="text-[12px] font-semibold text-[#D64545]">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 h-[52px] rounded-xl bg-ob-green text-[15px] font-semibold text-white transition-transform active:scale-[.97] disabled:opacity-60"
        >
          {submitting ? '가입하는 중…' : '가입하고 시작하기'}
        </button>
      </form>

      <div className="flex-[3]" />
    </div>
  );
}
