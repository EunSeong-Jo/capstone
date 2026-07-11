import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

export default function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col min-h-dvh px-6 py-10"
      style={{ background: 'linear-gradient(160deg, #1B5E40 0%, #3D8F6F 50%, #5BB88A 100%)' }}
    >
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center">
          <h1 className="text-[36px] font-black text-white tracking-tight">
            대체<span style={{ color: 'var(--accent)' }}>뭐야</span>
          </h1>
          <p className="mt-2 text-sm text-white/70">AI 화장품 성분 분석 & 대체품 매칭</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-8">
        <Button variant="primary" onClick={() => navigate('/qna')}>
          로그인하고 피부타입 진단해보기
        </Button>
        <Button variant="ghost" onClick={() => navigate('/home')}>
          로그인 없이 둘러보기
        </Button>
      </div>
    </div>
  );
}
