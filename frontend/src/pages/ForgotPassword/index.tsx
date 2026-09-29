import { useNavigate } from 'react-router-dom';

/**
 * 비밀번호 찾기 — 아직 만들지 않았다.
 *
 * 화면만 먼저 만들어 두고 "이메일이 맞으면 새 비밀번호로 바꿔 준다"로
 * 동작시키던 판이 있었는데, 그건 **남의 이메일 주소만 알면 계정을 가져갈 수
 * 있다**는 뜻이다. 제대로 하려면 메일로 보낸 일회용 토큰과 만료가 필요하고,
 * 이 프로젝트에는 아직 메일 발송 수단이 없다.
 *
 * 그래서 흉내를 내는 대신 준비 중임을 밝힌다. 지금 비밀번호를 잊으면
 * 팀에 문의하는 것이 실제 경로다.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate();

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

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span className="text-4xl">🔑</span>
        <p className="text-[17px] font-extrabold text-ob-green-deep">준비 중이에요</p>
        <p className="text-[13px] leading-relaxed text-gray-50">
          비밀번호 재설정은 본인 확인 메일이 필요해요.
          <br />
          메일 발송 기능을 붙인 뒤에 열어 드릴게요.
        </p>
        <p className="mt-1 text-[12px] text-gray-50">
          그동안 비밀번호를 잊으셨다면 고객센터로 문의해 주세요.
        </p>

        <button
          type="button"
          onClick={() => navigate('/mypage/customer-service')}
          className="mt-4 h-[46px] rounded-xl border border-gray-20 bg-white px-6 text-[14px] font-semibold text-gray-100 transition-transform active:scale-[.97]"
        >
          고객센터 바로가기
        </button>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="text-[13px] font-medium text-gray-50 underline underline-offset-2"
        >
          로그인으로 돌아가기
        </button>
      </div>

      <div className="flex-[2]" />
    </div>
  );
}
