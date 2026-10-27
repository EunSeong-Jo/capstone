import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { PERSONAS } from '../../data/personas';
import { useDemoPanel } from '../../hooks/useDemoPanel';
import { useToast } from '../../context/toast';

// APK 내려받기 버튼은 웹에서만 보인다(이미 앱 안이면 필요 없다).
// 실제 내려받기는 안드로이드 브라우저에서만 한다 — PC·iPhone은 APK를 설치할 수 없어 안내만 띄운다.
const SHOW_APK_DOWNLOAD = !Capacitor.isNativePlatform();
const IS_ANDROID_BROWSER = /Android/i.test(navigator.userAgent);

// 로그인 화면. `POST /api/v1/auth/login`으로 실제 인증한다.
// (스플래시 → 로그인 → 위피 인삿말(/onboarding) 순서)
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth가 막아서 온 경우 원래 가려던 곳. 없으면 인삿말로 간다.
  const from = (location.state as { from?: string } | null)?.from ?? null;
  const { login, loginAs, continueAsGuest } = useAuth();
  // 데모 계정 패널 표시 여부 — 로고를 연달아 눌러 켜고 끈다(비밀 명령, hooks/useDemoPanel.ts)
  const demo = useDemoPanel();
  const { showToast } = useToast();
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
    <div className="relative flex min-h-dvh flex-col bg-ob-bg px-7">
      {SHOW_APK_DOWNLOAD && (
        <a
          href="/swappy.apk"
          download="swappy.apk"
          onClick={(e) => {
            if (IS_ANDROID_BROWSER) return;
            e.preventDefault();
            showToast('앱 설치는 안드로이드 폰에서만 가능해요. PC·iPhone에서는 설치할 수 없어요.');
          }}
          className="absolute inset-x-0 top-0 flex items-center gap-3 bg-ob-green-soft/30 px-4 pb-2.5 active:opacity-80"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
        >
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold leading-tight text-gray-100">Swappy 앱 설치하기</span>
            <span className="mt-0.5 block text-[12px] leading-tight text-gray-70">안드로이드 전용 · 무료</span>
          </span>
          <span className="shrink-0 rounded-full bg-ob-green-deep px-3.5 py-1.5 text-[13px] font-semibold text-white">
            설치
          </span>
        </a>
      )}
      {/* 위 여백 — 콘텐츠 그룹을 화면 중앙보다 조금 아래에 둔다 */}
      <div className="flex-[4]" />

      {/* 로고 */}
      <div className="mt-2.5 flex flex-col items-center">
        <p
          className="select-none whitespace-nowrap text-[50px] leading-none"
          style={{ fontFamily: "'Rubik Doodle Shadow', system-ui, sans-serif" }}
          onClick={() => {
            const next = demo.tapLogo();
            if (next !== null) showToast(next ? '데모 계정 표시: 켜짐' : '데모 계정 표시: 꺼짐');
          }}
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

      {/* 데모 계정 빠른 로그인 — 시연·테스트용. 실제 로그인 UI가 아니다. 로고를 7번 연달아 누르면 켜고 끈다 */}
      {demo.visible && (
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
                <span className="block text-[11px] text-gray-50">{p.role}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-50">
            비밀번호는 전부 swappy1234 (예: donggyun@swappy.app)
          </p>
        </div>
      )}

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
