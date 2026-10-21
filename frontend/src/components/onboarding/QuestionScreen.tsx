import { motion } from 'framer-motion';
import { QUESTIONS, QUESTION_COUNT, QUESTION_HINT } from '../../data/onboarding';
import { useQuota } from '../../hooks/useSkinPhoto';

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
  /** 문항 도중에 얼굴 사진을 미리 찍어 둔다. 분석은 진단을 마칠 때 한 번만 한다 */
  photoReady: boolean;
  /** 사진 분석이 실패해 돌아왔을 때의 안내 */
  photoNotice: string | null;
  onPhoto: () => void; // 촬영 / 다시 찍기
  onClearPhoto: () => void;
  /** 남은 문항을 건너뛰고 지금까지의 답 + 사진으로 진단 */
  onAnalyzeNow: () => void;
}

const cameraIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export default function QuestionScreen({
  qIndex,
  answers,
  onPick,
  onNext,
  onBack,
  photoReady,
  photoNotice,
  onPhoto,
  onClearPhoto,
  onAnalyzeNow,
}: QuestionScreenProps) {
  const { quota } = useQuota();
  // 동의했는데 이번 달 횟수를 다 썼으면 찍어도 분석할 수 없다 — 버튼을 감춘다.
  const photoUnavailable = quota?.consentGranted === true && quota.remaining <= 0;
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

      {/* AI 피부진단 — 촬영만 미리 해 두고, 분석은 진단을 마칠 때 한다 */}
      <div className="px-5 pt-1">
        {photoNotice && (
          <p className="mb-2 rounded-xl bg-accent-light px-3 py-2 text-[11px] font-semibold leading-snug text-accent">
            {photoNotice}
          </p>
        )}
        {photoReady ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[11px] text-ob-green-deep">
              {cameraIcon}
              <span className="flex-1 font-semibold">사진이 준비됐어요</span>
              <button type="button" onClick={onPhoto} className="font-semibold underline underline-offset-2">
                다시 찍기
              </button>
              <button type="button" onClick={onClearPhoto} className="text-gray-50 underline underline-offset-2">
                삭제
              </button>
            </div>
            <button
              type="button"
              onClick={onAnalyzeNow}
              className="flex h-11 w-full items-center justify-center rounded-full border border-ob-green text-[12px] font-semibold text-ob-green-deep active:scale-[.98]"
            >
              이 사진으로 분석하기 · 남은 문항 건너뛰기
            </button>
          </div>
        ) : photoUnavailable ? (
          // 감추면 "버튼이 없어졌다"로 보인다 — 막힌 이유를 알려 준다.
          <p className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-gray-5 px-3 text-center text-[11px] text-gray-50">
            {cameraIcon}
            이번 달 AI 분석 횟수를 모두 사용했어요
            {quota && ` · ${new Date(quota.resetsAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}에 다시`}
          </p>
        ) : (
          <button
            type="button"
            onClick={onPhoto}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ob-surface text-[12px] font-semibold text-ob-green-deep active:scale-[.98]"
          >
            {cameraIcon}
            AI 피부진단으로 더 정확하게
            {quota?.consentGranted && (
              <span className="font-normal text-gray-50">· 이번 달 {quota.remaining}회</span>
            )}
          </button>
        )}
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
