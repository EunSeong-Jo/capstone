import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PERSONAS } from '../../data/personas';
import { hasSavedDiagnosis } from '../../context/DiagnosisContext';

// 데모 로그인 화면. 인증 API가 없어 personas.json과의 이메일·비밀번호 대조로 로그인한다.
// (스플래시 → 로그인 → 위피 인삿말(/onboarding) 순서)
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginAs, continueAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 이미 진단을 마친 계정이면 로그인할 때마다 온보딩 퀴즈를 다시 시키지 않는다.
  // 처음 만드는 계정(또는 아직 진단 전인 계정)만 /onboarding으로 보낸다.
  const goAfterLogin = (personaId: string) => {
    navigate(hasSavedDiagnosis(personaId) ? '/home' : '/onboarding');
  };

  // 실제 회원가입·인증 API가 없어 아직 "새 계정을 저장"할 방법이 없다. 그래서
  // personas.json에 없는 이메일/비밀번호를 쳐도 막지 않고, 데모 페르소나 중
  // 하나로 로그인한 것처럼 통과시킨다 — 계정을 안 가진 사람도 앱을 둘러볼 수 있어야 한다.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pw.trim()) {
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    const r = login(email, pw);
    if (r.ok && r.persona) {
      goAfterLogin(r.persona.id);
      return;
    }
    const fallback = loginAs(PERSONAS[0].id);
    if (fallback.ok && fallback.persona) {
      goAfterLogin(fallback.persona.id);
    } else {
      setError(r.error ?? '로그인에 실패했어요.');
    }
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
