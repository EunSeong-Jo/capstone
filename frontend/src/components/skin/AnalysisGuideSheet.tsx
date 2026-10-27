import { useEffect } from 'react';
import type { AnalysisDto } from '../../api/skinPhoto';
import { CONCERN_META, CONCERN_ORDER, SKIN_TYPE_LABEL } from '../../data/skinConcerns';

/**
 * 분석 결과 읽는 법 — 점수 방향, 종합 평가 계산, 항목별 설명과 이번 점수, 피부 분류.
 *
 * 점수 방향은 분석 업체 문서의 설명을 따른다: 점수는 **높을수록 건강하고 보기 좋은 상태**다
 * (항목마다 따로 정해진 방향은 없다). 화면에 보이는 값은 업체의 화면용 점수(`ui_score`)로,
 * 동기 부여를 위해 보정돼 있어 서로 다른 항목을 단순 비교하는 용도는 아니다.
 */
interface AnalysisGuideSheetProps {
  analysis: AnalysisDto;
  onClose: () => void;
}

const CLASS_ROWS = [
  { level: '양호', names: ['Normal'], text: '문제가 두드러지지 않는 분류예요.' },
  {
    level: '보통',
    names: ['Oily', 'Dry', 'Combination', 'Redness'],
    text: '한 가지로 치우친 분류예요.',
  },
  {
    level: '부족',
    names: ['Dry & Redness', 'Oily & Redness', 'Combination & Redness'],
    text: '두 가지가 겹친 분류예요(붉은기 포함).',
  },
];

export default function AnalysisGuideSheet({ analysis, onClose }: AnalysisGuideSheetProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const scores = new Map(analysis.concerns.map((c) => [c.key, c.score]));
  const rows = CONCERN_ORDER.filter((k) => scores.has(k) && CONCERN_META[k]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="분석 결과 읽는 법"
        className="fixed bottom-0 left-1/2 z-50 max-h-[85dvh] w-full max-w-[430px] -translate-x-1/2 animate-slide-up overflow-y-auto rounded-t-3xl bg-white px-5 pt-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-gray-20" />
        <h2 className="text-[16px] font-extrabold text-gray-100">분석 결과 읽는 법</h2>

        <section className="mt-4 rounded-2xl bg-ob-surface px-4 py-3">
          <p className="text-[13px] font-extrabold text-ob-green-deep">점수는 높을수록 좋아요</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-70">
            모든 항목은 100점에 가까울수록 피부가 건강하고 보기 좋은 상태라는 뜻이에요. 낮은 항목이 지금
            신경 쓸 부분이에요. 막대 색은 80점 이상 초록(양호), 60~79점 노랑(보통), 60점 미만 빨강(신경
            쓸 곳)이에요. 점수는 분석 업체의 화면용 점수라 항목끼리 단순 비교하기보다 내 변화를 보는 데
            써 주세요.
          </p>
        </section>

        <section className="mt-4">
          <p className="text-[13px] font-extrabold text-gray-100">AI 종합 평가는 이렇게 만들어요</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-70">
            분석된 항목 점수의 평균이에요. 80점 이상인 항목 중 높은 2개를 "잘 관리됨", 75점 미만인 항목 중
            낮은 2개를 "신경 쓸 곳"으로 보여 줘요.
          </p>
        </section>

        <section className="mt-4">
          <p className="text-[13px] font-extrabold text-gray-100">항목별 설명</p>
          <ul className="mt-2 flex flex-col divide-y divide-gray-10">
            {rows.map((key) => {
              const meta = CONCERN_META[key];
              return (
                <li key={key} className="py-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-semibold text-gray-100">{meta.label}</span>
                    <span className="text-[12px] font-bold text-ob-green-deep">이번 {scores.get(key)}점</span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-gray-70">{meta.desc}</p>
                  <p className="mt-0.5 text-[11px] text-gray-50">
                    높을수록 좋아요 · 낮으면 "{meta.low}"
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-4">
          <p className="text-[13px] font-extrabold text-gray-100">피부 분류는 3단계로 나눠요</p>
          <p className="mt-1 text-[12px] leading-relaxed text-gray-70">
            AI가 알려 주는 분류는 8가지예요. 점수가 아니라서, 치우친 문제가 몇 가지인지로 나눠 보여 줘요.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {CLASS_ROWS.map((r) => (
              <li key={r.level} className="rounded-xl bg-gray-5 px-3 py-2">
                <p className="text-[12px] font-bold text-gray-100">
                  {r.level}{' '}
                  <span className="font-medium text-gray-50">
                    · {r.names.map((n) => SKIN_TYPE_LABEL[n] ?? n).join(' · ')}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-gray-50">{r.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-50">
            T존(이마·코)과 U존(볼·턱)은 따로 분류해서 보여 줘요. 막대는 얼굴 전체 분류를 기준으로 해요.
          </p>
        </section>

        <p className="mt-4 text-[11px] leading-relaxed text-gray-50">
          사진 한 장으로 본 참고 값이에요. 조명·화장·각도에 따라 달라질 수 있고 의료적 진단이 아니에요.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-12 w-full rounded-xl bg-ob-green text-[14px] font-semibold text-white active:scale-[.98]"
        >
          확인
        </button>
      </div>
    </>
  );
}
