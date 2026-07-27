interface CategoryTabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export function CategoryTabs({ tabs, active, onChange }: CategoryTabsProps) {
  return (
    <div className="sticky top-12 z-10 flex gap-5 px-4 h-8 items-center bg-white overflow-x-auto scrollbar-hide border-b border-gray-20">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`flex-shrink-0 text-sm whitespace-nowrap transition-colors ${
            tab === active ? 'font-bold text-gray-100' : 'text-gray-50'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
