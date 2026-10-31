import { useRef, useState } from 'react';
import type { AnatomyItem } from '../../api/analysis';
import { BASE_COLOR, FUNC_INFO, ROLE_NAME, UNLABELED_COLOR } from './constants';

/** 칸의 대표 색: 활성·에몰리언트는 첫 기능의 색, 그 밖의 베이스는 회색, 라벨이 없으면 연한 회색 */
function colorOf(a: AnatomyItem): string {
  if (a.role == null) return UNLABELED_COLOR;
  if ((a.role === 'a' || a.role === 'e') && a.functions[0]) return FUNC_INFO[a.functions[0]]?.color ?? BASE_COLOR;
  return BASE_COLOR;
}

/**
 * 전성분 해부도. 전성분을 함량이 **적은 순서에서 많은 순서로**(왼쪽이 적음, 오른쪽이 많음) 한 줄의 띠로 보여 주고,
 * 기능별로 색을 칠한다. 오른쪽 끝이 베이스(회색)인지 활성(색)인지로 이 제품의 성격을 읽을 수 있다. 주의 성분은 위에 붉은 표시가 붙는다.
 * 칸을 누르면 아래에 그 성분의 이름과 정체가 나온다.
 *
 * 성분이 100개를 넘는 제품도 화면 폭 안에 들어온다. 칸 최소 폭을 두면 131개가 520px가 되어 앱 밖으로
 * 넘쳤다. 칸이 가늘어지는 만큼 손가락으로 **띠 위를 훑어서** 고를 수 있게 했다(눌러도 되고 끌어도 된다).
 */
export function IngredientBand({ anatomy }: { anatomy: AnatomyItem[] }) {
  const [picked, setPicked] = useState<AnatomyItem | null>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  if (anatomy.length === 0) return <p className="text-sm text-oy-sub">전성분 정보가 없어요.</p>;

  // 오른쪽이 많은 쪽이 되도록 뒤집은 순서. 칸이 너무 가늘면 사이 틈도 없앤다
  const ordered = [...anatomy].reverse();
  const dense = ordered.length > 60;

  /** 띠 위의 가로 위치 → 그 자리의 성분. 칸이 가늘어도 정확히 짚는다 */
  const pickAt = (clientX: number) => {
    const el = bandRef.current;
    if (!el) return;
    const { left, width } = el.getBoundingClientRect();
    const i = Math.min(ordered.length - 1, Math.max(0, Math.floor(((clientX - left) / width) * ordered.length)));
    setPicked(ordered[i]);
  };

  const used = new Set(anatomy.flatMap((a) => (a.role === 'a' || a.role === 'e' ? a.functions.slice(0, 1) : [])));

  return (
    <div>
      <div className="flex items-end justify-between text-[11px] text-oy-sub">
        <span>← 적게 들어 있음</span>
        <span>많이 들어 있음 →</span>
      </div>
      <div
        ref={bandRef}
        className={`mt-1 flex h-9 w-full items-end overflow-hidden ${dense ? 'gap-0' : 'gap-px'}`}
        role="list"
        aria-label="전성분 해부도"
        // 가로로 끌면 칸을 훑고, 세로로 밀면 페이지가 스크롤된다
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => dense && pickAt(e.clientX)}
        onPointerMove={(e) => dense && e.buttons === 1 && pickAt(e.clientX)}
      >
        {ordered.map((a) => {
          const on = picked?.position === a.position;
          return (
            <button
              key={a.position}
              type="button"
              role="listitem"
              aria-label={`${a.position}번 ${a.name}`}
              onClick={() => !dense && setPicked(on ? null : a)}
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              {a.caution && <span className="mb-0.5 h-1.5 w-full rounded-full bg-caution-solid" />}
              <span
                className={`block w-full ${dense ? '' : 'rounded-[2px]'} ${on ? 'h-full ring-2 ring-oy-text' : 'h-[70%]'}`}
                style={{ background: colorOf(a) }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-2 min-h-[34px] rounded-lg bg-oy-chip px-3 py-2 text-xs text-oy-text">
        {picked ? (
          <>
            <b>
              {picked.position}. {picked.name}
            </b>
            <span className="ml-1.5 text-oy-sub">
              {picked.role ? ROLE_NAME[picked.role] ?? '' : '분류 미정'}
              {picked.functions.length > 0 &&
                ` · ${picked.functions.map((f) => FUNC_INFO[f]?.name).filter(Boolean).join('·')}`}
              {picked.caution && ' · 주의 성분'}
            </span>
          </>
        ) : (
          <span className="text-oy-sub">칸을 누르면 성분 이름이 나와요.</span>
        )}
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-oy-sub">
        {[...used].map((f) => (
          <li key={f} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: FUNC_INFO[f]?.color }} />
            {FUNC_INFO[f]?.name}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: BASE_COLOR }} />
          베이스(용매·유화 등)
        </li>
        <li className="flex items-center gap-1">
          <span className="h-1.5 w-3 rounded-full bg-caution-solid" />
          주의 성분
        </li>
      </ul>
    </div>
  );
}
