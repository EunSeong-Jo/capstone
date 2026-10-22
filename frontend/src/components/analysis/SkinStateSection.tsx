import type { SkinStateAxis } from '../../api/analysis';

const STATUS = {
  good: { icon: '✅', tone: 'text-primary', bar: 'bg-primary' },
  some: { icon: '➖', tone: 'text-oy-text', bar: 'bg-[#F2B632]' },
  lack: { icon: '⚠️', tone: 'text-accent', bar: 'bg-accent' },
  fine: { icon: '·', tone: 'text-oy-sub', bar: 'bg-oy-line' },
} as const;

const CONCERN_CHIP = {
  focus: 'bg-accent-light text-accent',
  mild: 'bg-oy-chip text-oy-text',
  fine: 'bg-oy-chip text-oy-sub',
} as const;

/**
 * 내 피부 분석 결과(진단 5축 — 문답과 얼굴 사진 분석을 합친 값)와 이 제품을 견준다.
 *
 * 축마다 "내 피부는 이런 편이고(신경 쓸 정도), 이 제품은 그걸 이만큼 돕는다"를 한 줄로 말한다.
 * 신경 쓸 부분이 위에 오고, 신경 쓸 필요가 적은 축은 흐리게 아래로 간다.
 * 궁합 점수와는 별개의 설명이다 — 궁합은 피부타입만으로 정해 화면 간 값이 갈라지지 않게 한다.
 */
export function SkinStateSection({
  state,
  summary,
  photoUsed,
}: {
  state: SkinStateAxis[];
  summary: string | null;
  photoUsed: boolean;
}) {
  return (
    <div>
      {summary && (
        <p className="mb-3 rounded-xl bg-primary-light px-4 py-3 text-sm font-semibold leading-snug text-oy-text">
          {summary}
        </p>
      )}
      <ul className="space-y-2">
        {state.map((s) => {
          const st = STATUS[s.status];
          return (
            <li
              key={s.axis}
              className={`rounded-xl bg-white px-3.5 py-3 shadow-sm ${s.concern === 'fine' ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-oy-text">{s.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CONCERN_CHIP[s.concern]}`}>
                  {s.level}
                </span>
                <span className="ml-auto text-[11px] text-oy-sub">{s.score}/10</span>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <span className="mt-0.5 w-4 shrink-0 text-center text-xs">{st.icon}</span>
                <p className={`flex-1 text-[13px] leading-snug ${st.tone}`}>{s.message}</p>
              </div>
              {s.concern !== 'fine' && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-[68px] shrink-0 text-[10px] text-oy-sub">도움 정도</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-oy-chip">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${st.bar}`}
                      style={{ width: `${Math.max(s.coverage, 3)}%` }}
                    />
                  </span>
                </div>
              )}
              {s.risk && <p className="mt-2 text-xs leading-snug text-accent">－ {s.risk}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11px] leading-snug text-oy-sub">
        {photoUsed ? '얼굴 사진 분석이 반영된 내 진단 결과 기준이에요. ' : '피부 진단 결과 기준이에요. '}
        성분 구성으로 본 참고 정보예요.
      </p>
    </div>
  );
}
