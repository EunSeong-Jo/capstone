import type { SkinType } from '../../data/skinTypes';

interface TypeGridProps {
  types: SkinType[];
  selectedId: string;
  onSelect: (type: SkinType) => void;
}

// Figma "3.TypeGrid": 컨테이너 rgba(45,122,79,.25), 선택 셀 #8fcfb7 / 비선택 #e7f5f0.
export default function TypeGrid({ types, selectedId, onSelect }: TypeGridProps) {
  return (
    <div
      className="mx-[3cqmin] overflow-hidden rounded-[4cqmin] p-[0.3cqmin]"
      style={{ background: 'rgba(45,122,79,0.25)' }}
    >
      <div className="grid grid-cols-4 grid-rows-2 gap-[0.3cqmin]">
        {types.map((type) => {
          const isSelected = type.id === selectedId;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onSelect(type)}
              className="flex aspect-square items-center justify-center transition-colors"
              style={{ background: isSelected ? '#8fcfb7' : '#e7f5f0' }}
            >
              <img
                src={type.image}
                alt={type.label}
                draggable={false}
                className="select-none"
                style={{ width: 'clamp(48px, 16cqmin, 72px)' }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
