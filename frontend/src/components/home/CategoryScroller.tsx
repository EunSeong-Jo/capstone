import { HomeCategory } from '../../types';

interface CategoryScrollerProps {
  categories: HomeCategory[];
  onSelect?: (id: string) => void;
}

export function CategoryScroller({ categories, onSelect }: CategoryScrollerProps) {
  return (
    <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect?.(cat.id)}
          className="shrink-0 flex flex-col items-center gap-2 active:scale-95 transition-transform"
        >
          <span className="w-16 h-16 rounded-2xl bg-atelier-secondary-light flex items-center justify-center text-2xl shadow-soft">
            {cat.iconKey}
          </span>
          <span className="font-body text-xs text-atelier-text">{cat.label}</span>
        </button>
      ))}
    </div>
  );
}
