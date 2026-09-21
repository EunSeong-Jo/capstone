import type { SkinType } from '../../data/skinTypes';

interface TypeGridProps {
  types: SkinType[];
  selectedId: string;
  onSelect: (type: SkinType) => void;
}

// Figma "3.TypeGrid": 컨테이너 ob-green-deep 25%, 선택 셀 ob-green-soft / 비선택 ob-surface.
export default function TypeGrid({ types, selectedId, onSelect }: TypeGridProps) {
  return (
    <div className="mx-[3cqmin] overflow-hidden rounded-[4cqmin] bg-ob-green-deep/25 p-[0.3cqmin]">
      <div className="grid grid-cols-4 grid-rows-2 gap-[0.3cqmin]">
        {types.map((type) => {
          const isSelected = type.id === selectedId;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onSelect(type)}
              className={`flex aspect-square items-center justify-center transition-colors ${
                isSelected ? 'bg-ob-green-soft' : 'bg-ob-surface'
              }`}
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
