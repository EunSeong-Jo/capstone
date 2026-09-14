import { motion } from 'framer-motion';
import { QUESTIONS, QUESTION_COUNT, QUESTION_HINT } from '../../data/onboarding';

// Figma "질문창" (node 433:648) 6문항 진단.
//
// 현재 문항과 답은 페이지가 소유한다(qIndex는 URL의 q 파라미터). 기기 뒤로가기가
// 문항 사이를 오가야 하므로 단계 위치가 컴포넌트 안에 갇혀 있으면 안 된다.
const pad = (n: number) => String(n).padStart(2, '0');

interface QuestionScreenProps {
  qIndex: number; // 페이지가 0 … QUESTION_COUNT-1로 클램프해서 넘긴다
  answers: (number | null)[];
  onPick: (optionIndex: number) => void;
  onNext: () => void; // 다음 문항 또는 결과 — 목적지는 페이지가 정한다
  onBack: () => void; // 페이지가 navigate(-1)로 처리 (기기 뒤로가기와 동일)
}

export default function QuestionScreen({
  qIndex,
  answers,
  onPick,
  onNext,
  onBack,
}: QuestionScreenProps) {
  const question = QUESTIONS[qIndex];
  const selected = answers[qIndex];
  const isLast = qIndex === QUESTION_COUNT - 1; // 버튼 라벨 결정용

  return (
    <motion.div
      className="absolute inset-0 flex flex-col overflow-hidden bg-white"
      style={{
        paddingBottom: 'var(--safe-bottom)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 콘텐츠 상단 여백. 상태바/노치 인셋은 body의 --safe-top이 담당하므로 여기선 디자인 여백만 둔다 */}
      <div className="pt-11" />

      {/* 진행바 + 뒤로가기 + 카운트 — 바로 아래에 질문이 붙는다 */}
      <div className="flex items-center gap-3 px-5">
        <button type="button" onClick={onBack} aria-label="뒤로" className="shrink-0 p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="h-1 flex-1 rounded-full bg-[#d9d9d9]">
          <div
            className="h-1 rounded-full bg-ob-green transition-all duration-300"
            style={{ width: `${((qIndex + 1) / QUESTION_COUNT) * 100}%` }}
          />
        </div>
        <p className="shrink-0 text-[12px] italic">
          <span className="font-bold text-ob-green-deep">{pad(qIndex + 1)}</span>
          <span className="text-black"> / {pad(QUESTION_COUNT)}</span>
        </p>
      </div>

      {/* 질문 */}
      <div className="px-5 pt-5">
        <p className="text-[18px] font-semibold text-ob-green-deep">Q{qIndex + 1}.</p>
        <p className="mt-2 text-[15px] font-bold leading-snug text-black">{question.q}</p>
        <p className="mt-2 text-[11px] font-semibold" style={{ color: '#b3b3b3' }}>{QUESTION_HINT}</p>
      </div>

      {/* 보기 */}
      <div className="flex flex-1 flex-col gap-4 px-5 pb-2 pt-5">
        {question.options.map((opt, i) => {
          const isSel = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              className="flex items-center gap-3 rounded-lg bg-white px-4 py-5 text-left transition-shadow"
              style={{ boxShadow: isSel ? '0 0 0 2px var(--ob-green)' : '0 0 2px rgba(0,0,0,0.4)' }}
            >
              <span className="flex-1">
                <span className="block text-[12px] font-medium text-black">{opt.title}</span>
                <span className="mt-1 block text-[10px]" style={{ color: '#9d9d9d' }}>{opt.desc}</span>
              </span>
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                style={{ borderColor: isSel ? 'var(--ob-green)' : '#c9c9c9' }}
              >
                {isSel && <span className="h-2.5 w-2.5 rounded-full bg-ob-green" />}
              </span>
            </button>
          );
        })}
      </div>

      {/* 다음으로 / 결과보러가기 */}
      <div className="px-5 pb-[25px] pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={selected === null}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ob-green text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
        >
          {isLast ? '결과보러가기' : '다음으로'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
