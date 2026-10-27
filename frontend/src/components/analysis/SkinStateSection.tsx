import type { SkinStateAxis } from '../../api/analysis';
import type { SkinStateSource } from '../../hooks/useSkinStateSource';
import { StateGroups, type StateRow } from './StateGroups';

/** 이 비교가 어느 데이터에 근거했는지. 숫자는 항상 하나의 출처만 쓴다. */
function SOURCE_LABEL(source: SkinStateSource, photoAt: string | null): string {
  if (source === 'photo') {
    const d = photoAt ? new Date(photoAt) : null;
    return `AI 사진 분석 기준${d ? ` · ${d.getMonth() + 1}/${d.getDate()}` : ''}`;
  }
  return '문답 진단 기준';
}

/**
 * 내 피부 분석 결과(진단 5축 — 문답과 얼굴 사진 분석을 합친 값)와 이 제품을 견준다.
 *
 * 축마다 "내 피부는 이런 편이고(신경 쓸 정도), 이 제품은 그걸 이만큼 돕는다"를 한 줄로 말한다.
 * 신경 쓸 부분이 위에 오고, 신경 쓸 필요가 적은 축은 흐리게 아래로 간다.
 * 궁합 점수와는 별개의 설명이다 — 궁합은 피부타입만으로 정해 화면 간 값이 갈라지지 않게 한다.
 */
export function SkinStateSection({
  state,
  source,
  photoAt,
}: {
  state: SkinStateAxis[];
  source: SkinStateSource;
  photoAt: string | null;
}) {
  // 5축 원본은 0~10(수분만 높을수록 좋음). 서버가 사진 분석과 같은 방향·단위·색 경계의 건강도 100점으로 환산해 준다.
  const rows: StateRow[] = state.map((s) => ({
    key: s.axis,
    name: s.name,
    scoreText: `${s.health}점`,
    health: s.health,
    concern: s.concern,
    label: s.level,
    status: s.status,
    message: s.message,
    risk: s.risk,
  }));

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold text-primary">{SOURCE_LABEL(source, photoAt)}</p>
      <StateGroups rows={rows} />
      <p className="mt-2.5 text-[11px] leading-snug text-oy-sub">
        성분 구성으로 본 참고 정보예요.
      </p>
    </div>
  );
}
