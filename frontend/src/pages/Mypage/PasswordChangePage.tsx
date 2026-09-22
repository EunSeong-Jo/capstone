import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { changePassword } from '../../api/auth';
import { ApiError } from '../../api/client';
import { setTokens } from '../../api/tokenStore';

/**
 * 비밀번호 변경 (`POST /api/v1/auth/password`).
 *
 * 서버가 이 계정의 다른 세션(리프레시 토큰)을 전부 끊고 새 한 벌을 내준다.
 * 그 토큰을 여기서 저장하지 않으면 **방금 바꾼 본인이 다음 갱신에서
 * 튕긴다.**
 *
 * 예전에는 성공 알림만 띄우고 실제로는 아무 일도 하지 않았다.
 */

/** 서버 규칙(`schemas/user.py: PASSWORD_MIN_LENGTH`)과 같은 값. */
const MIN_LEN = 8;

export default function PasswordChangePage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const lengthOk = next.length >= MIN_LEN;
  const matchOk = next.length > 0 && next === confirm;
  const differs = next.length > 0 && next !== current;
  const valid = current.length > 0 && lengthOk && matchOk && differs && !saving;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const bundle = await changePassword(current, next);
      setTokens(bundle.accessToken, bundle.refreshToken);
      setDone(true);
      window.setTimeout(() => navigate(-1), 1200);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('현재 비밀번호가 올바르지 않아요.');
      } else if (err instanceof ApiError && err.status === 422) {
        setError('새 비밀번호를 다시 확인해 주세요.');
      } else if (err instanceof ApiError && err.status === 0) {
        setError('서버에 연결할 수 없어요.');
      } else {
        setError('비밀번호를 바꾸지 못했어요.');
      }
      setSaving(false);
    }
  };

  const input =
    'mt-2 h-12 w-full rounded-xl border border-gray-20 bg-white px-3.5 text-[14px] text-gray-100 outline-none focus:border-primary disabled:opacity-60';

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="비밀번호 변경" />

      <div className="flex flex-1 flex-col px-4 py-5">
        <div className="rounded-2xl border border-[#ECEEE8] bg-white px-4">
          <div className="py-4">
            <label className="block text-[13px] font-bold text-gray-100">현재 비밀번호</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              disabled={saving || done}
              onChange={(e) => {
                setCurrent(e.target.value);
                setError(null);
              }}
              className={input}
            />
          </div>
          <div className="border-t border-[#F1F2ED] py-4">
            <label className="block text-[13px] font-bold text-gray-100">새 비밀번호</label>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              disabled={saving || done}
              onChange={(e) => {
                setNext(e.target.value);
                setError(null);
              }}
              className={input}
            />
          </div>
          <div className="border-t border-[#F1F2ED] py-4">
            <label className="block text-[13px] font-bold text-gray-100">새 비밀번호 확인</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={saving || done}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              className={input}
            />
          </div>
        </div>

        <ul className="mt-3 space-y-1">
          <li className={`text-[12px] ${lengthOk ? 'text-primary-dark' : 'text-gray-50'}`}>
            · {MIN_LEN}자 이상
          </li>
          <li className={`text-[12px] ${matchOk ? 'text-primary-dark' : 'text-gray-50'}`}>
            · 새 비밀번호 일치
          </li>
          <li className={`text-[12px] ${differs ? 'text-primary-dark' : 'text-gray-50'}`}>
            · 지금 쓰는 비밀번호와 다름
          </li>
        </ul>

        <p className="mt-3 text-[12px] leading-relaxed text-gray-50">
          비밀번호를 바꾸면 다른 기기에 남아 있던 로그인은 모두 해제돼요.
        </p>

        {error && <p className="mt-3 text-[12px] font-semibold text-[#D64545]">{error}</p>}
        {done && (
          <p className="mt-3 text-[12px] font-semibold text-primary-dark">
            비밀번호를 바꿨어요.
          </p>
        )}

        <div className="mt-auto pb-[var(--safe-bottom)] pt-8">
          <button
            type="button"
            disabled={!valid}
            onClick={submit}
            className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary-dark text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-50"
          >
            {saving ? '변경하는 중…' : '비밀번호 변경'}
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
