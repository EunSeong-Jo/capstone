interface OyFloatingActionsProps {
  onChatbot?: () => void;
  onRecommendSet?: () => void;
}

/** 우하단 원형 빠른접근 버튼 — 대체뭐야 추천 세트 + 챗봇 (맨위로 버튼 위에 위치) */
export function OyFloatingActions({ onChatbot, onRecommendSet }: OyFloatingActionsProps) {
  return (
    <div
      className="fixed right-4 z-30 flex flex-col items-center gap-3"
      style={{ bottom: 'calc(72px + var(--safe-bottom))' }}
    >
      {/* 추천 상품 세트 */}
      <button
        onClick={onRecommendSet}
        aria-label="대체뭐야 추천 상품 세트"
        className="w-16 h-16 rounded-full shadow-lg flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
        style={{ backgroundColor: '#3D8F6F' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="12.5" rx="1.5" />
          <path d="M3 12h18M12 8v12.5" />
          <path d="M12 8c-1-2.5-2.6-4-4-3s-.4 3 4 3zM12 8c1-2.5 2.6-4 4-3s.4 3-4 3z" />
        </svg>
        <span className="text-[10px] font-bold text-white leading-none">추천세트</span>
      </button>

      {/* 챗봇 */}
      <button
        onClick={onChatbot}
        aria-label="챗봇 상담"
        className="w-16 h-16 rounded-full shadow-lg flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
        style={{ backgroundColor: '#17171C' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 3.5V6a1 1 0 011-1z" />
          <path d="M9 10.5h.01M12.5 10.5h.01M16 10.5h.01" />
        </svg>
        <span className="text-[10px] font-bold text-white leading-none">챗봇</span>
      </button>
    </div>
  );
}
