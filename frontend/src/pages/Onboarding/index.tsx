import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { skinTypes, RESULT_TYPE_ID } from '../../data/skinTypes';
import type { SkinType } from '../../data/skinTypes';
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

const resultType = skinTypes.find((t) => t.id === RESULT_TYPE_ID) ?? skinTypes[0];

export default function OnboardingPage({ initialStep = 'greeting' }: { initialStep?: Step }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(initialStep);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [selectedType, setSelectedType] = useState<SkinType>(skinTypes[0]);
  // 몰라요(진단) 경로면 결과는 subuji 고정, 알아요면 그리드에서 고른 타입.
  const [cardType, setCardType] = useState<SkinType>(resultType);

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
              setCardType(selectedType);
              setStep('resultCard');
            }}
          />
        )}
        {step === 'question' && (
          <QuestionScreen
            key="question"
            onNext={() => setStep('loading')}
            onBack={() => {
              setGreetingIndex(2);
              setStep('greeting');
            }}
          />
        )}
        {step === 'loading' && (
          <LoadingScreen
            key="loading"
            onComplete={() => {
              setCardType(resultType);
              setStep('resultMsg');
            }}
          />
        )}
        {step === 'resultMsg' && (
          <ResultMessageScreen
            key="resultMsg"
            typeLabel={resultType.label}
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
