import type { ConcernState } from '../../api/analysis';
import type { AnalysisDto } from '../../api/skinPhoto';
import { CONCERN_META, SKIN_TYPE_LABEL } from '../../data/skinConcerns';
import { StateGroups, type StateRow } from './StateGroups';

const skinClass = (v: string | null | undefined) => (v ? (SKIN_TYPE_LABEL[v] ?? v) : null);

/**
 * AI 사진 분석으로 **분석된 항목 전부**를 이 제품과 견준다 (무료 8개·구독 16개 — 피부 분류 포함).
 *
 * 항목마다 "내 피부는 이런 상태(점수 0~100, 높을수록 좋음)이고, 이 제품은 그걸 이만큼 돕는다"를 한 줄로 말한다.
 * 눈가 처짐처럼 화장품 성분으로 바뀌기 어려운 항목은 견주지 않고 참고로만 보여 준다.
 * 무료 사용자에게는 구독하면 더 견줄 수 있는 항목이 있다는 안내가 붙는다.
 */
export function ConcernStateSection({
  state,
  photo,
  onSubscribe,
}: {
  state: ConcernState[];
  photo: AnalysisDto;
  onSubscribe: () => void;
}) {
  const total = state.length + 1; // 피부 분류 1개 포함
  const whole = skinClass(photo.skinTypes.whole);
  const t = skinClass(photo.skinTypes.tZone);
  const u = skinClass(photo.skinTypes.uZone);
  const d = new Date(photo.createdAt);
  const dateText = Number.isNaN(d.getTime()) ? '' : ` · ${d.getMonth() + 1}/${d.getDate()}`;
  const rows: StateRow[] = state.map((c) => ({
    key: c.key,
    name: c.name,
    scoreText: `${c.score}점`,
    health: c.score,
    concern: c.concern,
    label: CONCERN_META[c.key]?.low ?? c.level,
    status: c.status,
    message: c.message,
    risk: c.risk,
  }));

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold text-primary">
        AI 사진 분석 기준{dateText} · {total}개 항목
      </p>

      {whole && (
        <div className="mb-3 rounded-xl bg-white px-3.5 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-oy-text">피부 분류</span>
            <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary">{whole}</span>
          </div>
          {(t || u) && (
            <p className="mt-1.5 text-xs text-oy-sub">
              {t && <>T존 {t}</>}
              {t && u && ' · '}
              {u && <>U존 {u}</>}
            </p>
          )}
        </div>
      )}

      <StateGroups rows={rows} />

      {!photo.extended && (
        <button
          type="button"
          onClick={onSubscribe}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-primary/40 bg-primary-light px-3.5 py-2.5 text-left"
        >
          <span className="text-[13px] leading-snug text-oy-text">
            구독하면 <b className="text-primary">피부결·광채·탄력·눈가</b> 등 8개 항목도 이 제품과 견줘 드려요
          </span>
          <span className="shrink-0 text-xs font-bold text-primary">보기 ›</span>
        </button>
      )}

      <p className="mt-2.5 text-[11px] leading-snug text-oy-sub">점수는 0~100이고 높을수록 좋아요. 성분 구성으로 본 참고 정보예요.</p>
    </div>
  );
}
