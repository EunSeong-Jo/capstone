import type { SkinType } from '../../types';
import { DECORATIONS, TYPE_FACE_SRC, UNKNOWN_FACE_SRC } from '../../data/mascotAssets';

interface CharacterAvatarProps {
  /** 모르면 null — 8종 중 하나를 골라 보여주면 그게 곧 거짓이 된다. */
  skinType: SkinType | null;
  decorationId?: number | null;
  className?: string;
}

/** 피부타입 마스코트 + 꾸미기 데코레이션을 함께 그리는 공용 캐릭터 — 홈·마이·꾸미기 화면 공용 */
export function CharacterAvatar({ skinType, decorationId, className = '' }: CharacterAvatarProps) {
  const deco = decorationId != null ? DECORATIONS.find((d) => d.id === decorationId) : undefined;
  // 진단 전에는 범용 얼굴. 장식은 그대로 얹힌다 — 타입을 몰라도 꾸밀 수 있다.
  const face = skinType !== null ? TYPE_FACE_SRC[skinType] : UNKNOWN_FACE_SRC;

  return (
    <div className={`relative ${className}`}>
      <img src={face} alt="내 캐릭터" className="h-full w-full object-contain" />
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
