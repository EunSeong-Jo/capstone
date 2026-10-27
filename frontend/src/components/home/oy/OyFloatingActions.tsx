import { CharacterAvatar } from '../../character/CharacterAvatar';
import { useCharacter } from '../../../context/character';
import { useSkinType } from '../../../hooks/useSkinType';

interface OyFloatingActionsProps {
  onChatbot?: () => void;
  onRecommendSet?: () => void;
}

/** 우하단 원형 빠른접근 버튼 — swappy 추천 세트 + 챗봇 (맨위로 버튼 위에 위치) */
export function OyFloatingActions({ onChatbot, onRecommendSet }: OyFloatingActionsProps) {
  // 챗봇 버튼은 말풍선 아이콘 대신 내 캐릭터를 보여 준다(QA 13) — 챗봇 화면의
  // 아바타(ChatSupportPage의 BotAvatar)와 같은 캐릭터라 눌렀을 때 이어진다.
  const { skinType } = useSkinType();
  const { decorationId } = useCharacter();

  return (
    <div
      className="fixed right-4 z-30 flex flex-col items-center gap-3"
      style={{ bottom: 'calc(72px + var(--safe-bottom))' }}
    >
      {/* 추천 상품 세트 */}
      <button
        onClick={onRecommendSet}
        aria-label="swappy 추천 상품 세트"
        className="w-16 h-16 rounded-full shadow-lg border border-gray-20 bg-white flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3D8F6F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="12.5" rx="1.5" />
          <path d="M3 12h18M12 8v12.5" />
          <path d="M12 8c-1-2.5-2.6-4-4-3s-.4 3 4 3zM12 8c1-2.5 2.6-4 4-3s.4 3-4 3z" />
        </svg>
        <span className="text-[11px] font-bold text-gray-100 leading-none">추천세트</span>
      </button>

      {/* 챗봇 */}
      <button
        onClick={onChatbot}
        aria-label="챗봇 상담"
        className="w-16 h-16 rounded-full shadow-lg border border-gray-20 bg-white flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform"
      >
        <CharacterAvatar skinType={skinType} decorationId={decorationId} className="h-9 w-9" />
        <span className="text-[11px] font-bold text-gray-100 leading-none">챗봇</span>
      </button>
    </div>
  );
}
