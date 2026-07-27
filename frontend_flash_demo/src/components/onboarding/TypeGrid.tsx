import type { SkinType } from '../../data/skinTypes'

interface TypeGridProps {
  types: SkinType[]
  selectedId: string
  onSelect: (type: SkinType) => void
}

export default function TypeGrid({ types, selectedId, onSelect }: TypeGridProps) {
  return (
    <div className="mx-[3cqmin] rounded-[4cqmin] overflow-hidden bg-swappy-green/25 p-[0.3cqmin]">
      <div className="grid grid-cols-4 grid-rows-2 gap-[0.3cqmin]">
        {types.map((type) => {
          const isSelected = type.id === selectedId
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onSelect(type)}
              className={`flex aspect-square items-center justify-center transition-colors ${
                isSelected ? 'bg-swappy-pink/40' : 'bg-swappy-beige'
              }`}
            >
              <img
                src={type.image}
                alt={type.label}
                draggable={false}
                className="select-none"
                style={{ width: 'clamp(56px, 18cqmin, 80px)' }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
