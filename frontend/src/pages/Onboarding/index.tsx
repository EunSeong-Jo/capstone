import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

const FEATURES = [
  { emoji: '🔬', title: '성분 유사도 분석', desc: 'AI가 전성분을 비교해 최적의 대체품을 찾아드려요' },
  { emoji: '🎯', title: '피부타입 맞춤 추천', desc: '8가지 피부 캐릭터 진단으로 나만의 루틴을 구성해요' },
  { emoji: '💰', title: '가성비 구매 가이드', desc: '예산 내 최적 화장품 루틴을 제안해드려요' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col min-h-dvh px-6 py-10"
      style={{ background: 'linear-gradient(160deg, #1B5E40 0%, #3D8F6F 50%, #5BB88A 100%)' }}
    >
      {/* 앱명 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="text-center">
          <h1 className="text-[28px] font-black text-white tracking-tight">
            대체<span style={{ color: 'var(--accent)' }}>뭐야</span>
          </h1>
          <p className="mt-2 text-sm text-white/70">AI 화장품 성분 분석 & 대체품 매칭</p>
        </div>

        {/* 핵심 기능 카드 */}
        <div className="w-full flex flex-col gap-3">
          {FEATURES.map(({ emoji, title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,.15)' }}
            >
              <span className="text-2xl">{emoji}</span>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-white/70 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA 버튼 */}
      <div className="flex flex-col gap-3 pb-8">
        <Button variant="primary" onClick={() => navigate('/qna')}>
          피부 타입 진단하고 시작하기
        </Button>
        <Button variant="ghost" onClick={() => navigate('/home')}>
          로그인 없이 둘러보기
        </Button>
      </div>
    </div>
  );
}
