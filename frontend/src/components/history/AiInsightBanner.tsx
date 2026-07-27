interface AiInsightBannerProps {
  headline: string;
  subtext: string;
  onAnalyze?: () => void;
}

/** 최근 본 탭 상단 AI 인사이트 배너 — 분석 결과는 목업(실제 AI 분석 연동 전) */
export function AiInsightBanner({ headline, subtext, onAnalyze }: AiInsightBannerProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-4 rounded-2xl mb-5"
      style={{ background: 'linear-gradient(135deg, #2A2140 0%, #1C1730 100%)' }}
    >
      <div className="min-w-0">
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold text-white/80 bg-white/15 mb-2">
          AI INSIGHT
        </span>
        <p className="text-sm font-bold text-white leading-snug mb-1">{headline}</p>
        <p className="text-xs text-white/60 leading-relaxed">{subtext}</p>
      </div>
      <button
        onClick={onAnalyze}
        className="shrink-0 px-3.5 py-2 rounded-full bg-accent text-xs font-bold text-white active:scale-95 transition-transform"
      >
        분석보기
      </button>
    </div>
  );
}
