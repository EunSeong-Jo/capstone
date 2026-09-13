import { useState } from 'react';
import { motion } from 'framer-motion';

// Figma "질문창" (node 433:648) 6문항 진단. 마지막 문항에서 '결과보러가기'를 누르면
// 선택한 답(문항별 보기 인덱스)을 onNext로 넘긴다 — Onboarding이 이를 5축 점수로
// 환산해(data/skinTypeScoring.ts) 결과 타입을 정한다.
interface Q {
  q: string;
  options: { title: string; desc: string }[];
}

const HINT = '자신의 피부 상태에 가장 가까운 것을 선택해 주세요.';

const QUESTIONS: Q[] = [
  {
    q: '아침에 물로만 세수하고 1시간이 지났을 때, 내 피부 상태와 가장 가까운 것은?',
    options: [
      { title: '전체적으로 당김이 심하고 푸석해요', desc: '피부 속 유수분이 모두 부족해 얼굴이 팽팽하게 당기는 느낌이 들어요.' },
      { title: 'T존은 번들거리는데, 볼이나 입가는 당겨요', desc: '이마와 코에는 기름기가 돌지만 뺨 주변은 건조해 부위별 밸런스가 달라요.' },
      { title: '얼굴 전체적으로 기름기가 올라와요', desc: '세안 후 얼마 지나지 않아도 얼굴 전반에 피지 분비가 왕성해져요.' },
      { title: '당김도 없고 기름지지도 않아요', desc: '유수분 균형이 완벽하게 잡혀있어 아무것도 바르지 않아도 부드러워요.' },
    ],
  },
  {
    q: '화장품을 바꾸거나, 미세먼지가 심한 날 내 피부는 어떻게 반응하나요?',
    options: [
      { title: '쉽게 붉어지고 가렵거나 따가운 통증이 있다', desc: '새로운 제품이나 외부 자극에 곧바로 예민하게 반응해요.' },
      { title: '컨디션이 나쁘면 간지럽거나 뾰루지가 올라온다', desc: '평소엔 괜찮다가 몸 상태가 나빠지면 자극 신호가 나타나요.' },
      { title: '계절이 바뀔 때만 일시적으로 각질이 일어난다', desc: '환절기 건조함으로 잠깐 결이 거칠어지는 정도예요.' },
      { title: '외부 자극이나 화장품 변경에도 늘 평온하다', desc: '웬만한 자극에는 흔들리지 않는 튼튼한 장벽을 가졌어요.' },
    ],
  },
  {
    q: '평소 여드름, 붉은 홍조, 혹은 화농성 염증이 얼마나 자주 발생하나요?',
    options: [
      { title: '365일 큰 뾰루지와 붉은 기가 가라앉지 않는다', desc: '염증성 트러블이 만성적으로 이어져 진정 케어가 급해요.' },
      { title: '유분이 많아 좁쌀 여드름이나 블랙헤드가 자주 생긴다', desc: '피지가 모공에 쌓이며 자잘한 트러블이 반복돼요.' },
      { title: '생리 전이나 컨디션이 안 좋을 때만 종종 올라온다', desc: '호르몬·피로 등 특정 시기에만 간헐적으로 나타나요.' },
      { title: '트러블이나 염증성 고민이 거의 없이 매끈하다', desc: '피부 결이 안정적이라 염증 걱정이 거의 없어요.' },
    ],
  },
  {
    q: '거울을 볼 때 가장 먼저 해결하고 싶은 피부 고민은 무엇인가요?',
    options: [
      { title: '기미, 잡티, 그리고 여드름이 남긴 거뭇한 흔적', desc: '색소 침착으로 톤이 칙칙하고 얼룩덜룩해 보여요.' },
      { title: '눈가나 입가의 미세한 잔주름과 처지는 탄력', desc: '시간이 지나며 볼륨이 꺼지고 잔주름이 늘고 있어요.' },
      { title: '하얗게 트는 겨울 같은 각질과 거친 결', desc: '건조로 각질이 들뜨고 손에 걸리는 느낌이 있어요.' },
      { title: '특별한 고민 없이 현재의 건강한 상태 유지', desc: '지금의 좋은 컨디션을 오래 지키고 싶어요.' },
    ],
  },
  {
    q: '기름종이를 쓰거나 메이크업을 했을 때 무너지는 스타일은 어떤가요?',
    options: [
      { title: '기름이 올라와 지워지듯 얼굴 전체가 번들거린다', desc: '시간이 조금만 지나도 얼굴 전반에 유분이 올라와요.' },
      { title: '겉은 번들거리는데 속은 당겨서 화장이 뜬다', desc: '유분과 건조가 동시에 나타나 메이크업이 들떠요.' },
      { title: '시간이 지나면 코 주변만 살짝 지워지는 정도다', desc: 'T존 일부만 약하게 무너지고 나머지는 유지돼요.' },
      { title: '유분 때문에 화장이 무너지지 않고 유지된다', desc: '유수분이 안정적이라 메이크업이 오래 지속돼요.' },
    ],
  },
  {
    q: '평소 스킨케어를 고를 때 가장 중요하게 생각하는 포인트는 무엇인가요?',
    options: [
      { title: '끈적임 없고 촉촉하게 스며드는 가벼운 에센스', desc: '산뜻한 사용감으로 빠르게 수분만 채우고 싶어요.' },
      { title: '영양을 채워주고 보호막을 세워주는 튼튼한 크림', desc: '진하게 감싸 건조와 자극을 막아주길 원해요.' },
      { title: '자극 성분이 없는 순한 화장품', desc: '향·알코올 등 자극 요소를 최대한 뺀 처방을 선호해요.' },
      { title: '미백이나 주름 개선 등 확실한 효과를 주는 고기능성 앰플', desc: '눈에 보이는 개선을 주는 액티브 성분을 중시해요.' },
    ],
  },
];

const TOTAL = QUESTIONS.length;
const pad = (n: number) => String(n).padStart(2, '0');

interface QuestionScreenProps {
  onNext: (answers: (number | null)[]) => void; // 마지막 문항 완료 — 문항별 선택 인덱스
  onBack: () => void; // 첫 문항에서 뒤로
}

export default function QuestionScreen({ onNext, onBack }: QuestionScreenProps) {
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(TOTAL).fill(null));

  const question = QUESTIONS[qIndex];
  const selected = answers[qIndex];
  const isLast = qIndex === TOTAL - 1;

  const pick = (i: number) =>
    setAnswers((prev) => prev.map((v, idx) => (idx === qIndex ? i : v)));

  const goBack = () => (qIndex === 0 ? onBack() : setQIndex((i) => i - 1));
  const goNext = () => (isLast ? onNext(answers) : setQIndex((i) => i + 1));

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
        <button type="button" onClick={goBack} aria-label="뒤로" className="shrink-0 p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="h-1 flex-1 rounded-full bg-[#d9d9d9]">
          <div
            className="h-1 rounded-full transition-all duration-300"
            style={{ width: `${((qIndex + 1) / TOTAL) * 100}%`, background: '#00916d' }}
          />
        </div>
        <p className="shrink-0 text-[12px] italic">
          <span className="font-bold" style={{ color: '#2d7a4f' }}>{pad(qIndex + 1)}</span>
          <span className="text-black"> / {pad(TOTAL)}</span>
        </p>
      </div>

      {/* 질문 */}
      <div className="px-5 pt-5">
        <p className="text-[18px] font-semibold" style={{ color: '#2d7a4f' }}>Q{qIndex + 1}.</p>
        <p className="mt-2 text-[15px] font-bold leading-snug text-black">{question.q}</p>
        <p className="mt-2 text-[11px] font-semibold" style={{ color: '#b3b3b3' }}>{HINT}</p>
      </div>

      {/* 보기 */}
      <div className="flex flex-1 flex-col gap-4 px-5 pb-2 pt-5">
        {question.options.map((opt, i) => {
          const isSel = selected === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
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

      {/* 다음으로 / 결과보러가기 */}
      <div className="px-5 pb-[25px] pt-2">
        <button
          type="button"
          onClick={goNext}
          disabled={selected === null}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
          style={{ background: '#00916d' }}
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
