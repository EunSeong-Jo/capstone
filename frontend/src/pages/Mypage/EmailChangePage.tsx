import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { updateMyEmail } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/auth';

/**
 * 이메일 변경 (`PATCH /api/v1/me`).
 *
 * 이메일은 로그인 id다. 바꾸면 그 순간부터 새 주소로 로그인해야 하므로
 * 서버가 현재 비밀번호를 확인한다 — 자리를 비운 사이 기기를 만진 사람이
 * 로그인 주소를 자기 것으로 바꿔 계정을 가져가는 경로를 막는다.
 *
 * 예전에는 `UserProfileContext`(localStorage)에만 적어, 실제 로그인 주소는
 * 그대로였다.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailChangePage() {
  const navigate = useNavigate();
  const { user, reloadMe } = useAuth();
  const currentEmail = user?.email ?? '';
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const trimmed = email.trim();
  const validFormat = EMAIL_RE.test(trimmed);
  const isDifferent = trimmed.toLowerCase() !== currentEmail.toLowerCase();
  const valid = validFormat && isDifferent && password.length > 0 && !saving;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateMyEmail(trimmed, password);
      await reloadMe();
      setDone(true);
      window.setTimeout(() => navigate(-1), 1200);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('현재 비밀번호가 올바르지 않아요.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError('이미 사용 중인 이메일이에요.');
      } else if (err instanceof ApiError && err.status === 0) {
        setError('서버에 연결할 수 없어요.');
      } else {
        setError('이메일을 바꾸지 못했어요.');
      }
      setSaving(false);
    }
  };

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="이메일 변경" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <p className="text-[12px] text-gray-50">
          지금 이메일 <span className="font-semibold text-gray-100">{currentEmail}</span>
        </p>

        <label className="mt-5 block text-[13px] font-bold text-gray-100">새 이메일</label>
        <div className="mt-2 flex items-center rounded-xl border border-gray-20 bg-white px-3.5 focus-within:border-primary">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            disabled={saving || done}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="example@email.com"
            className="h-12 flex-1 bg-transparent text-[14px] text-gray-100 outline-none disabled:opacity-60"
          />
        </div>

        <label className="mt-6 block text-[13px] font-bold text-gray-100">현재 비밀번호</label>
        <div className="mt-2 flex items-center rounded-xl border border-gray-20 bg-white px-3.5 focus-within:border-primary">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={saving || done}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="본인 확인을 위해 입력해 주세요"
            className="h-12 flex-1 bg-transparent text-[14px] text-gray-100 outline-none placeholder:text-gray-50 disabled:opacity-60"
          />
        </div>

        <ul className="mt-3 space-y-1">
          <li className={`text-[12px] ${validFormat ? 'text-primary-dark' : 'text-gray-50'}`}>
            · 올바른 이메일 형식
          </li>
          <li className={`text-[12px] ${isDifferent ? 'text-primary-dark' : 'text-gray-50'}`}>
            · 기존 이메일과 다른 주소
          </li>
        </ul>

        <p className="mt-3 text-[12px] leading-relaxed text-gray-50">
          바꾼 뒤에는 새 이메일로 로그인해요.
        </p>

        {error && <p className="mt-3 text-[12px] font-semibold text-[#D64545]">{error}</p>}
        {done && (
          <p className="mt-3 text-[12px] font-semibold text-primary-dark">이메일을 바꿨어요.</p>
        )}

        <div className="mt-auto pb-[var(--safe-bottom)] pt-8">
          <button
            type="button"
            disabled={!valid}
            onClick={submit}
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary-dark text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-50"
          >
            {saving ? '변경하는 중…' : '이메일 변경'}
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
