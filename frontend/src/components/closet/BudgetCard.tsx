import { useState } from 'react';
import { BUDGET_LIMIT, BUDGET_STEP, Budget, useBudget } from '../../hooks/useBudget';
import { useToast } from '../../context/toast';

/**
 * 정하기 전 손잡이 자리. **금액으로 보여 주지 않는다** — 정하지 않은 사용자에게
 * 그럴듯한 기본 금액을 띄우면 저장된 값처럼 읽힌다. 양 끝에 두고 색칠도 하지 않는다.
 */
const UNSET_POSITION: Budget = { min: 0, max: BUDGET_LIMIT };

const won = (n: number) => (n >= BUDGET_LIMIT ? `${BUDGET_LIMIT / 10_000}만원+` : `${(n / 10_000).toLocaleString()}만원`);

/**
 * 화장품 예산 — 루틴 전체 구매 금액의 최소~최대 범위 슬라이더.
 *
 * 저장 전까지는 화면 안에서만 움직인다(`draft`). 끌 때마다 서버에 쓰면
 * 손잡이 한 번에 요청이 수십 개 나간다.
 */
export function BudgetCard() {
  const { budget, loading, save } = useBudget();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);

  // 화면에 금액으로 보여 줄 값. 로딩 중이거나 정하지 않았으면 null이다.
  const shown = draft ?? budget;
  const value = shown ?? UNSET_POSITION;
  const dirty = draft !== null && (budget === null || draft.min !== budget.min || draft.max !== budget.max);

  const setMin = (v: number) => setDraft({ min: Math.min(v, value.max), max: value.max });
  const setMax = (v: number) => setDraft({ min: value.min, max: Math.max(v, value.min) });

  const submit = async () => {
    setSaving(true);
    try {
      await save(value);
      setDraft(null);
      showToast('예산을 저장했어요');
    } catch {
      showToast('저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };

  // 두 손잡이가 같은 자리에 겹치면 움직일 수 있는 쪽을 위로 올린다: 오른쪽 끝에서는 최소(왼쪽으로만 갈 수 있다),
  // 그 밖(0원 포함)에서는 최대(오른쪽으로만 갈 수 있다). 0~0에서 최소 손잡이가 위에 있으면 어느 쪽도 못 움직였다.
  const minOnTop = value.min === value.max && value.min >= BUDGET_LIMIT / 2;

  const left = (value.min / BUDGET_LIMIT) * 100;
  const right = (value.max / BUDGET_LIMIT) * 100;

  return (
    <section className="mt-3 rounded-[20px] border border-[#ECEEE8] bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-gray-100">화장품 예산</p>
          <p className="mt-0.5 text-[11px] text-gray-50">
            {loading
              ? '불러오는 중…'
              : budget === null && draft === null
                ? '아직 정하지 않았어요. 범위를 정해 주세요'
                : '스킨·로션·에센스 등 루틴을 살 때 쓸 금액이에요'}
          </p>
        </div>
        <p
          className={`shrink-0 text-[15px] font-extrabold ${shown ? 'text-primary-dark' : 'text-gray-50'}`}
        >
          {shown ? `${won(shown.min)} ~ ${won(shown.max)}` : loading ? '—' : '미설정'}
        </p>
      </div>

      <div className="relative mt-4 h-[22px]">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-10" />
        {shown && (
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `${left}%`, right: `${100 - right}%` }}
          />
        )}
        <input
          type="range"
          className="dual-range"
          min={0}
          max={BUDGET_LIMIT}
          step={BUDGET_STEP}
          value={value.min}
          disabled={loading}
          onChange={(e) => setMin(Number(e.target.value))}
          aria-label="최소 예산"
          aria-valuetext={shown ? won(shown.min) : '미설정'}
          style={{ zIndex: minOnTop ? 3 : 1 }}
        />
        <input
          type="range"
          className="dual-range"
          min={0}
          max={BUDGET_LIMIT}
          step={BUDGET_STEP}
          value={value.max}
          disabled={loading}
          onChange={(e) => setMax(Number(e.target.value))}
          aria-label="최대 예산"
          aria-valuetext={shown ? won(shown.max) : '미설정'}
          style={{ zIndex: minOnTop ? 1 : 2 }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-gray-50">
        <span>0원</span>
        <span>{won(BUDGET_LIMIT)}</span>
      </div>

      {dirty && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="h-10 flex-1 rounded-xl border border-gray-20 text-[12px] font-bold text-gray-70 active:scale-[.98] transition-transform"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-10 flex-[2] rounded-xl text-[12px] font-bold text-white disabled:opacity-60 active:scale-[.98] transition-transform"
            style={{ background: '#00916D' }}
          >
            {saving ? '저장 중…' : '예산 저장'}
          </button>
        </div>
      )}
    </section>
  );
}
