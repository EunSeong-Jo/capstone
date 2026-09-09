import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// 데모 로그인 화면. 인증 API가 아직 없어 입력값과 무관하게 온보딩(진단)으로 바로 진입한다.
// (스플래시 → 로그인 → 위피 인삿말(/onboarding) 순서)
export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');

  return (
    <div
      className="flex min-h-dvh flex-col px-7"
      style={{ background: '#F5F6F3' }}
    >
      {/* 위 여백 — 콘텐츠 그룹을 화면 중앙보다 조금 아래에 둔다 */}
      <div className="flex-[5]" />

      {/* 로고 */}
      <div className="mt-2.5 flex flex-col items-center">
        <p
          className="whitespace-nowrap text-[50px] leading-none"
          style={{ fontFamily: "'Rubik Doodle Shadow', system-ui, sans-serif" }}
        >
          <span style={{ color: '#ef969f' }}>S</span>
          <span style={{ color: '#2d7a4f' }}>wappy</span>
        </p>
        <p className="mt-3 text-[13px] text-gray-50">AI 화장품 성분 분석 &amp; 대체품 매칭</p>
      </div>

      {/* 입력 — 로고 아래 40px */}
      <form
        className="mt-10 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          navigate('/onboarding');
        }}
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-[52px] rounded-xl border border-gray-20 bg-white px-4 text-[14px] text-gray-100 outline-none focus:border-primary"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="h-[52px] rounded-xl border border-gray-20 bg-white px-4 text-[14px] text-gray-100 outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="mt-1 h-[52px] rounded-xl text-[15px] font-semibold text-white transition-transform active:scale-[.97]"
          style={{ background: '#00916D' }}
        >
          로그인하고 피부타입 진단하기
        </button>
      </form>

      {/* 보조 링크 */}
      <div className="mt-3 flex items-center justify-center gap-3 text-[12px] text-gray-50">
        <button type="button" onClick={() => alert('준비 중이에요')}>이메일로 가입</button>
        <span className="text-gray-20">|</span>
        <button type="button" onClick={() => alert('준비 중이에요')}>비밀번호 찾기</button>
      </div>

      {/* 소셜 로그인 (데모) */}
      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-gray-20" />
        <span className="text-[11px] text-gray-50">간편 로그인</span>
        <span className="h-px flex-1 bg-gray-20" />
      </div>
      <div className="mt-4 flex justify-center gap-4">
        {[
          { k: 'kakao', bg: '#FEE500', fg: '#191600', t: 'K' },
          { k: 'naver', bg: '#03C75A', fg: '#fff', t: 'N' },
          { k: 'google', bg: '#fff', fg: '#4285F4', t: 'G' },
        ].map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => alert('준비 중이에요')}
            aria-label={`${s.k} 로그인`}
            className="grid h-12 w-12 place-items-center rounded-full border border-gray-20 text-[16px] font-bold active:scale-95 transition-transform"
            style={{ background: s.bg, color: s.fg }}
          >
            {s.t}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/home')}
        className="mt-7 text-center text-[13px] font-medium text-gray-50 underline underline-offset-2"
      >
        로그인 없이 둘러보기
      </button>

      {/* 아래 여백 */}
      <div className="flex-[4]" />
    </div>
  );
}
