import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { PERSONAS } from '../../data/personas';

// 로그인 화면. `POST /api/v1/auth/login`으로 실제 인증한다.
// (스플래시 → 로그인 → 위피 인삿말(/onboarding) 순서)
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth가 막아서 온 경우 원래 가려던 곳. 없으면 인삿말로 간다.
  const from = (location.state as { from?: string } | null)?.from ?? null;
  const { login, loginAs, continueAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  // 서버 왕복이 생겼으므로 중복 제출을 막고 진행 중임을 알린다.
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await login(email, pw);
    setBusy(false);
    if (r.ok) navigate(from ?? '/onboarding', { replace: true });
    else setError(r.error ?? '로그인에 실패했어요.');
  };

  const quickLogin = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await loginAs(id);
    setBusy(false);
    if (r.ok) navigate(from ?? '/onboarding', { replace: true });
    else setError(r.error ?? '로그인에 실패했어요.');
  };

  return (
    <div className="flex min-h-dvh flex-col bg-ob-bg px-7">
      {/* 위 여백 — 콘텐츠 그룹을 화면 중앙보다 조금 아래에 둔다 */}
      <div className="flex-[4]" />

      {/* 로고 */}
      <div className="mt-2.5 flex flex-col items-center">
        <p
          className="whitespace-nowrap text-[50px] leading-none"
          style={{ fontFamily: "'Rubik Doodle Shadow', system-ui, sans-serif" }}
        >
          <span style={{ color: '#ef969f' }}>S</span>
          <span className="text-ob-green-deep">wappy</span>
        </p>
        <p className="mt-3 text-[13px] text-gray-50">AI 화장품 성분 분석 &amp; 대체품 매칭</p>
      </div>

      {/* 입력 — 로고 아래 40px */}
      <form
        className="mt-10 flex flex-col gap-3"
        onSubmit={submit}
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className="h-[52px] rounded-xl border border-gray-20 bg-white px-4 text-[14px] text-gray-100 outline-none focus:border-primary"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setError(null);
          }}
          className="h-[52px] rounded-xl border border-gray-20 bg-white px-4 text-[14px] text-gray-100 outline-none focus:border-primary"
        />
        {error && <p className="text-[12px] font-semibold text-[#D64545]">{error}</p>}
        <button
          type="submit"
          className="mt-1 h-[52px] rounded-xl bg-ob-green text-[15px] font-semibold text-white transition-transform active:scale-[.97]"
        >
          로그인하고 피부타입 진단하기
        </button>
      </form>

      {/* 보조 링크 */}
      <div className="mt-3 flex items-center justify-center gap-3 text-[12px] text-gray-50">
        <button type="button" onClick={() => navigate('/signup')}>이메일로 가입</button>
        <span className="text-gray-20">|</span>
        <button type="button" onClick={() => navigate('/forgot-password')}>비밀번호 찾기</button>
      </div>

      {/* 데모 계정 빠른 로그인 — 시연·테스트용. 실제 로그인 UI가 아니다 */}
      <div className="mt-6 rounded-2xl border border-dashed border-[#C9CFC5] bg-white/60 p-3">
        <p className="mb-2 text-center text-[11px] font-bold text-gray-50">데모 계정으로 바로 로그인 (팀원 6종 — 게스트 포함)</p>
        <div className="grid grid-cols-3 gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => quickLogin(p.id)}
              className="rounded-lg border border-[#DCE8E1] bg-white px-2 py-2 text-left active:scale-95 transition-transform"
            >
              <span className="block text-[11px] font-semibold text-primary-dark">{p.nickname}</span>
              <span className="block text-[9px] text-gray-50">{p.role}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-50">
          비밀번호는 전부 swappy1234 (예: donggyun@swappy.app)
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          continueAsGuest();
          navigate('/home');
        }}
        className="mt-6 text-center text-[13px] font-medium text-gray-50 underline underline-offset-2"
      >
        로그인 없이 둘러보기
      </button>

      {/* 아래 여백 */}
      <div className="flex-[4]" />
    </div>
  );
}
