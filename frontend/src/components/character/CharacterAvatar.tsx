import type { SkinType } from '../../types';
import { TYPE_FACE_SRC, DECORATIONS } from '../../data/mascotAssets';

interface CharacterAvatarProps {
  skinType: SkinType;
  decorationId?: number | null;
  className?: string;
}

/** 피부타입 마스코트 + 꾸미기 데코레이션을 함께 그리는 공용 캐릭터 — 홈·마이·꾸미기 화면 공용 */
export function CharacterAvatar({ skinType, decorationId, className = '' }: CharacterAvatarProps) {
  const deco = decorationId != null ? DECORATIONS.find((d) => d.id === decorationId) : undefined;

  return (
    <div className={`relative ${className}`}>
      <img src={TYPE_FACE_SRC[skinType]} alt="내 캐릭터" className="h-full w-full object-contain" />
      {deco && (
        <img
          src={deco.src}
          alt={deco.label}
          className="absolute object-contain"
          style={{
            left: `${deco.box.left}%`,
            top: `${deco.box.top}%`,
            width: `${deco.box.size}%`,
            height: `${deco.box.size}%`,
          }}
        />
      )}
    </div>
  );
}
