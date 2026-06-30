interface ExpBarProps {
  level: number;
  exp: number;
  nextLevelExp: number;
  /** 칭호 (Lv 옆에 표기) */
  title?: string;
}

/** 경험치 진행 바 — 미니멀 뉴트럴 (Lv·칭호 + 진행률) */
export function ExpBar({ level, exp, nextLevelExp, title }: ExpBarProps) {
  const pct = Math.min(100, Math.round((exp / nextLevelExp) * 100));
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between text-[10px] mb-1">
        <span className="font-bold text-gray-100">
          Lv.{level}
          {title && <span className="ml-1 font-medium text-gray-50">· {title}</span>}
        </span>
        <span className="text-gray-50">
          {exp}/{nextLevelExp}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gray-100 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
