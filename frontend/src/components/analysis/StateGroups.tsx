import type { ReactNode } from 'react';

/** 화면용으로 정규화한 한 항목. 사진 분석 항목과 문답 5축이 같은 모양으로 그려진다. */
export interface StateRow {
  key: string;
  name: string;
  /** 점수 표기 ('74점') */
  scoreText: string;
  /** 내 피부가 그 항목에서 얼마나 건강한가 0~100 (높을수록 좋음) — 막대 길이 */
  health: number;
  /** 신경 쓸 정도 */
  concern: 'focus' | 'mild' | 'fine';
  /** 신경 쓸 때의 표현('수분이 부족해요') */
  label: string;
  /** 이 제품의 대응: good 도와요 · some 조금 · lack 부족 · fine 해당 적음 · na 성분으로 바뀌기 어려움 */
  status: 'good' | 'some' | 'lack' | 'fine' | 'na';
  message: string;
  risk: string | null;
}

const TONE = {
  focus: { bar: 'bg-caution-solid', text: 'text-caution' },
  mild: { bar: 'bg-caution-solid', text: 'text-oy-text' },
  fine: { bar: 'bg-primary', text: 'text-primary' },
} as const;

const PILL = {
  good: 'bg-good-soft text-good',
  some: 'bg-caution-soft text-caution',
  lack: 'bg-danger-soft text-danger',
  fine: 'bg-oy-chip text-oy-sub',
  na: 'bg-oy-chip text-oy-sub',
} as const;
/** 정도 3단계: 도와줘요 · 도움이 부족해요(일부만 있음) · 도움이 많이 부족해요(거의 없음) */
const PILL_TEXT = { good: '도와줘요', some: '도움이 부족해요', lack: '도움이 많이 부족해요', fine: '', na: '' } as const;

function Row({ r }: { r: StateRow }) {
  const tone = TONE[r.concern];
  const showLabel = r.concern !== 'fine';
  return (
    <li className="py-3">
      {/* 이름 · 점수 ........ 이 제품의 대응 */}
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-oy-text">{r.name}</span>
        <span className="text-[11px] text-oy-sub">{r.scoreText}</span>
        {PILL_TEXT[r.status] && (
          <span className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PILL[r.status]}`}>
            {PILL_TEXT[r.status]}
          </span>
        )}
      </div>
      {/* 내 피부 상태 막대(길수록 건강) */}
      <span className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-oy-chip">
        <span className={`absolute inset-y-0 left-0 rounded-full ${tone.bar}`} style={{ width: `${Math.max(r.health, 3)}%` }} />
      </span>
      {/* 무엇이 문제이고(색) 제품이 어떻게 대응하는지(회색) 한 줄로 */}
      {(showLabel || r.message) && (
        <p className="mt-1.5 text-xs leading-snug">
          {showLabel && <span className={`font-semibold ${tone.text}`}>{r.label}</span>}
          {showLabel && r.message && <span className="text-oy-sub"> · </span>}
          {r.message && <span className={r.status === 'na' ? 'text-oy-sub' : 'text-oy-text'}>{r.message}</span>}
        </p>
      )}
      {r.risk && <p className="mt-1 text-xs leading-snug text-caution">－ {r.risk}</p>}
    </li>
  );
}

function Group({ title, hint, tone, children }: { title: string; hint?: string; tone: 'accent' | 'primary' | 'plain'; children: ReactNode }) {
  const head = { accent: 'text-caution', primary: 'text-good', plain: 'text-oy-text' }[tone];
  return (
    <div className="rounded-xl bg-white px-3.5 pt-3 pb-1 shadow-sm">
      <p className={`text-[13px] font-extrabold ${head}`}>{title}</p>
      {hint && <p className="mt-0.5 text-[11px] text-oy-sub">{hint}</p>}
      <ul className="mt-1 divide-y divide-oy-line">{children}</ul>
    </div>
  );
}

/**
 * 신경 쓸 부분과 이 제품의 대응을 **결과별로 묶어** 보여 준다.
 *
 *   좋은 점   → 먼저(좋은 소식부터)
 *   아쉬운 점
 *   바뀌기 어려운 항목(참고)·좋은 편 → 접어서 한 줄 칩으로
 *
 * 항목이 16개여도 한 항목이 한 줄(+설명 한 줄)이라 길이가 줄고, 어떤 묶음이 중요한지 눈에 들어온다.
 */
export function StateGroups({ rows }: { rows: StateRow[] }) {
  const lacking = rows.filter((r) => r.concern !== 'fine' && (r.status === 'lack' || r.status === 'some'));
  const helped = rows.filter((r) => r.concern !== 'fine' && r.status === 'good');
  const na = rows.filter((r) => r.concern !== 'fine' && r.status === 'na');
  const fine = rows.filter((r) => r.concern === 'fine');

  return (
    <div className="space-y-3">
      {helped.length > 0 && (
        <Group title="좋은 점" hint="내가 신경 쓰는 부분을 성분이 돕고 있어요" tone="primary">
          {helped.map((r) => <Row key={r.key} r={r} />)}
        </Group>
      )}
      {lacking.length > 0 && (
        <Group title="아쉬운 점" hint="내가 신경 쓰는 부분인데 이 제품의 성분이 충분하지 않아요" tone="accent">
          {lacking.map((r) => <Row key={r.key} r={r} />)}
        </Group>
      )}
      {lacking.length === 0 && helped.length === 0 && na.length === 0 && (
        <p className="rounded-xl bg-primary-light px-4 py-3 text-sm text-primary">신경 쓸 부분이 없어요. 지금 피부 상태가 좋아요.</p>
      )}
      {na.length > 0 && (
        <Group title="화장품 성분으로 바뀌기 어려운 항목" hint="참고로만 알려드려요" tone="plain">
          {na.map((r) => <Row key={r.key} r={r} />)}
        </Group>
      )}
      {fine.length > 0 && (
        <div className="rounded-xl bg-white px-3.5 py-3 shadow-sm">
          <p className="text-[13px] font-extrabold text-oy-text">신경 쓸 필요가 적어요</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {fine.map((r) => (
              <li key={r.key} className="rounded-full bg-primary-light px-2.5 py-1 text-[11px] font-semibold text-primary">
                {r.name} <span className="font-normal opacity-70">{r.scoreText}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
