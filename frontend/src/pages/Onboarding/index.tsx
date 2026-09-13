import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { skinTypes, RESULT_TYPE_ID } from '../../data/skinTypes';
import type { SkinType as SkinTypeData } from '../../data/skinTypes';
import type { SkinType } from '../../types';
import { computeDiagnosis } from '../../data/skinTypeScoring';
import { useDiagnosis } from '../../context/DiagnosisContext';
import GreetingScreen from '../../components/onboarding/GreetingScreen';
import TypeGridScreen from '../../components/onboarding/TypeGridScreen';
import QuestionScreen from '../../components/onboarding/QuestionScreen';
import LoadingScreen from '../../components/onboarding/LoadingScreen';
import ResultMessageScreen from '../../components/onboarding/ResultMessageScreen';
import ResultCardScreen from '../../components/onboarding/ResultCardScreen';

// 스플래시 → 위피 인삿말 → (알아요) TypeGrid  |  (몰라요) 질문창1 → 로딩 → result message → result card
//                                    └──────────────┴──────────────→ result card → X:메인 / 추천받기:추천 제품
type Step = 'greeting' | 'grid' | 'question' | 'loading' | 'resultMsg' | 'resultCard';

const HOME = '/home'; // 메인화면
const RECOMMEND = '/home'; // 추천 제품 페이지 (앱에서 Home이 피부타입 맞춤 추천을 보여줌)

const fallbackType = skinTypes.find((t) => t.id === RESULT_TYPE_ID) ?? skinTypes[0];
const typeData = (id: string): SkinTypeData => skinTypes.find((t) => t.id === id) ?? fallbackType;

export default function OnboardingPage({ initialStep = 'greeting' }: { initialStep?: Step }) {
  const navigate = useNavigate();
  const { saveDiagnosis } = useDiagnosis();
  const [step, setStep] = useState<Step>(initialStep);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [selectedType, setSelectedType] = useState<SkinTypeData>(skinTypes[0]);
  // 결과 카드에 넘길 타입 — 문답 진단 결과(몰라요) 또는 그리드에서 고른 타입(알아요)
  const [cardType, setCardType] = useState<SkinTypeData>(fallbackType);

  // container-type:size → 자식이 cqmin/cqh(앱 프레임 기준)로 배치된다.
  // mode="wait" 없이: 각 화면은 absolute inset-0라 0.5s 크로스페이드된다.
  return (
    <div className="relative w-full h-dvh overflow-hidden" style={{ containerType: 'size' }}>
      <AnimatePresence>
        {step === 'greeting' && (
          <GreetingScreen
            key="greeting"
            greetingIndex={greetingIndex}
            onAdvance={() => setGreetingIndex((i) => i + 1)}
            onKnow={() => setStep('grid')}
            onDontKnow={() => setStep('question')}
          />
        )}
        {step === 'grid' && (
          <TypeGridScreen
            key="grid"
            selectedType={selectedType}
            onSelect={setSelectedType}
            onConfirm={() => {
              const id = selectedType.id as SkinType;
              saveDiagnosis({
                skinType: id,
                scores: { moisture: 5, oil: 5, sensitivity: 5, pigmentation: 5, trouble: 5 },
                ranks: [{ rank: 1, skinType: id, score: 1 }],
                source: 'preset',
              });
              setCardType(selectedType);
              setStep('resultCard');
            }}
          />
        )}
        {step === 'question' && (
          <QuestionScreen
            key="question"
            onNext={(answers) => {
              const computed = computeDiagnosis(answers);
              saveDiagnosis({
                skinType: computed.skinType,
                scores: computed.scores,
                ranks: computed.ranks,
                answers,
                source: 'quiz',
              });
              setCardType(typeData(computed.skinType));
              setStep('loading');
            }}
            onBack={() => {
              setGreetingIndex(2);
              setStep('greeting');
            }}
          />
        )}
        {step === 'loading' && (
          <LoadingScreen key="loading" onComplete={() => setStep('resultMsg')} />
        )}
        {step === 'resultMsg' && (
          <ResultMessageScreen
            key="resultMsg"
            typeLabel={cardType.label}
            onAdvance={() => setStep('resultCard')}
          />
        )}
        {step === 'resultCard' && (
          <ResultCardScreen
            key="resultCard"
            resultType={cardType}
            onClose={() => navigate(HOME)}
            onRecommend={() => navigate(RECOMMEND)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
