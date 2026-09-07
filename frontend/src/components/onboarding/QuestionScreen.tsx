import { useState } from 'react';
import { motion } from 'framer-motion';

// Figma "질문창1" (node 433:648). 6문항 진단(Task 13) 중 Q1만 이식 — 답 선택 후 '다음으로' → 로딩.
const QUESTION = '아침에 물로만 세수하고 1시간이 지났을 때, 내 피부 상태와 가장 가까운 것은?';
const OPTIONS = [
  {
    title: '전체적으로 당김이 심하고 푸석해요',
    desc: '피부 속 유수분이 모두 부족해 얼굴이 팽팽하게 당기는 느낌이 들어요.',
  },
  {
    title: 'T존은 번들거리는데, 볼이나 입가는 당겨요',
    desc: '이마와 코에는 기름기가 돌지만 뺨 주변은 건조해 부위별 밸런스가 달라요.',
  },
  {
    title: '얼굴 전체적으로 기름기가 올라와요',
    desc: '세안 후 얼마 지나지 않아도 얼굴 전반에 피지 분비가 왕성해져요.',
  },
  {
    title: '당김도 없고 기름지지도 않아요',
    desc: '유수분 균형이 완벽하게 잡혀있어 아무것도 바르지 않아도 부드러워요.',
  },
];

interface QuestionScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export default function QuestionScreen({ onNext, onBack }: QuestionScreenProps) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col overflow-hidden bg-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 상단 여백: 상태바(시간·배터리) 자리 ~44px */}
      <div className="pt-11" />

      {/* 진행바 + 뒤로가기 + 카운트 — 바로 아래에 질문이 붙는다 */}
      <div className="flex items-center gap-3 px-5">
        <button type="button" onClick={onBack} aria-label="뒤로" className="shrink-0 p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="h-1 flex-1 rounded-full bg-[#d9d9d9]">
          <div className="h-1 rounded-full" style={{ width: '16.6%', background: '#00916d' }} />
        </div>
        <p className="shrink-0 text-[12px] italic">
          <span className="font-bold" style={{ color: '#2d7a4f' }}>01</span>
          <span className="text-black"> / 06</span>
        </p>
      </div>

      {/* 질문 */}
      <div className="px-5 pt-5">
        <p className="text-[18px] font-semibold" style={{ color: '#2d7a4f' }}>Q1.</p>
        <p className="mt-2 text-[15px] font-bold leading-snug text-black">{QUESTION}</p>
        <p className="mt-2 text-[11px] font-semibold" style={{ color: '#b3b3b3' }}>
          자신의 피부 상태에 가장 가까운 것을 선택해 주세요.
        </p>
      </div>

      {/* 보기 */}
      <div className="flex flex-1 flex-col gap-4 px-5 pb-2 pt-5">
          {OPTIONS.map((opt, i) => {
            const isSel = selected === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                className="flex items-center gap-3 rounded-lg bg-white px-4 py-5 text-left transition-shadow"
                style={{ boxShadow: isSel ? '0 0 0 2px #00916d' : '0 0 2px rgba(0,0,0,0.4)' }}
              >
                <span className="flex-1">
                  <span className="block text-[12px] font-medium text-black">{opt.title}</span>
                  <span className="mt-1 block text-[10px]" style={{ color: '#9d9d9d' }}>{opt.desc}</span>
                </span>
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                  style={{ borderColor: isSel ? '#00916d' : '#c9c9c9' }}
                >
                  {isSel && <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#00916d' }} />}
                </span>
              </button>
            );
          })}
      </div>

      {/* 다음으로 */}
      <div className="px-5 pb-[25px] pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={selected === null}
          className="h-12 w-full rounded-full text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
          style={{ background: '#00916d' }}
        >
          다음으로
        </button>
      </div>
    </motion.div>
  );
}
