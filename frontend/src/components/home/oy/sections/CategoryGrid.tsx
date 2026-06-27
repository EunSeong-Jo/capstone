import { useNavigate } from 'react-router-dom';
import { OY_CATEGORIES } from '../../../../mocks/oliveyoung';

/** 2. 카테고리 아이콘 그리드 (2행 × 5열) */
export function CategoryGrid() {
  const navigate = useNavigate();
  return (
    <section className="px-4 py-4">
      <div className="grid grid-cols-5 gap-y-4 gap-x-2">
        {OY_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => navigate(`/category?c=${cat.id}`)}
            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <span className="relative w-14 h-14 rounded-2xl overflow-hidden bg-oy-chip">
              <img src={cat.imageUrl} alt={cat.label} className="w-full h-full object-cover" />
              {cat.isNew && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-oy-red text-white text-[9px] font-bold flex items-center justify-center">
                  N
                </span>
              )}
            </span>
            <span className="text-xs text-oy-text">{cat.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
