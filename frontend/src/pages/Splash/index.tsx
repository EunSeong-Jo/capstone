import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SplashPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/onboarding'), 1500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-dvh gap-6"
      style={{ background: 'linear-gradient(160deg, #1B5E40 0%, #3D8F6F 50%, #5BB88A 100%)' }}
    >
      <div className="text-center">
        <h1 className="text-[48px] font-black text-white tracking-tight leading-none">
          대체<span style={{ color: 'var(--accent)' }}>뭐야</span>
        </h1>
        <p className="mt-3 text-sm text-white/70 tracking-wide">AI 화장품 성분 분석 & 대체품 매칭</p>
      </div>

      {/* 로딩 인디케이터 */}
      <div className="flex gap-1.5 mt-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-white/60"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40% { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
