import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { skinTypes } from '../../data/skinTypes';
import type { SkinType } from '../../data/skinTypes';
// data/skinTypes의 SkinType은 화면에 그릴 객체({id,label,…}), types의 SkinType은
// 그 id의 문자열 유니온이다. 이름이 겹치므로 후자에 별칭을 준다.
import type { SkinType as SkinTypeId } from '../../types';
import { GREETING_COUNT, QUESTION_COUNT } from '../../data/onboarding';
import { computeDiagnosis } from '../../data/skinTypeScoring';
import { useUserProfile } from '../../context/userProfile';
import { useDiagnosis } from '../../context/DiagnosisContext';
import GreetingScreen from '../../components/onboarding/GreetingScreen';
import TypeGridScreen from '../../components/onboarding/TypeGridScreen';
import QuestionScreen from '../../components/onboarding/QuestionScreen';
import LoadingScreen from '../../components/onboarding/LoadingScreen';
import ResultMessageScreen from '../../components/onboarding/ResultMessageScreen';
import ResultCardScreen from '../../components/onboarding/ResultCardScreen';

// 인삿말 → (알아요) 타입 그리드 | (몰라요) 질문창 Q1~Q6 → 로딩 → 결과 메시지 → 결과 카드
//
// 단계 위치만 URL에 둔다. 그래야 전진마다 히스토리 엔트리가 생겨 기기 뒤로가기가
// 그냥 동작한다 — popstate 리스너도, history.pushState도 필요 없고 뒤로가기 구현은
// navigate(-1) 하나뿐이다. 정확성은 전환마다 push냐 replace냐로 확보한다.
//   ?step=greeting&g=0..2 | grid | question&q=0..5 | loading
//   ?step=result-msg&type=<id> | result-card&type=<id>
type Step = 'greeting' | 'grid' | 'question' | 'loading' | 'result-msg' | 'result-card';

const STEPS: readonly string[] = [
  'greeting',
  'grid',
  'question',
  'loading',
  'result-msg',
  'result-card',
];
const isStep = (v: string | null): v is Step => v !== null && STEPS.includes(v);

const HOME = '/home';
const RECOMMEND = '/home'; // 추천 제품 페이지 (앱에서 Home이 피부타입 맞춤 추천을 보여줌)

// null·'abc'·'99' 전부 0으로. 범위 밖 인덱스는 타자 효과·문항 조회를 죽인다.
const clampIndex = (raw: string | null, count: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < count ? n : 0;
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { profile } = useUserProfile();
  const { saveDiagnosis } = useDiagnosis();

  const rawStep = params.get('step');
  // 결과 화면은 type을 URL에 담아 자기 완결적으로 만든다. 카드 → ✕ → /home → 뒤로가기는
  // HomePage가 마운트되며 이 페이지를 언마운트시키므로 useState로는 복원되지 않는다.
  const cardType: SkinType | null = skinTypes.find((t) => t.id === params.get('type')) ?? null;
  const needsType = rawStep === 'result-msg' || rawStep === 'result-card';
  const step: Step = !isStep(rawStep) || (needsType && !cardType) ? 'greeting' : rawStep;
  const greetingIndex = clampIndex(params.get('g'), GREETING_COUNT);
  const qIndex = clampIndex(params.get('q'), QUESTION_COUNT);

  // 단계 위치가 아닌 상태는 React state로 둔다. 검색 파라미터만 바뀌면 언마운트되지
  // 않으므로 세션 내 뒤/앞으로가기에서 살아남는다. 리마운트(새로고침·타 라우트 경유)
  // 시에만 기본값으로 돌아가고, 그때도 크래시 없이 degrade한다.
  const [selectedType, setSelectedType] = useState<SkinType>(skinTypes[0]);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    Array(QUESTION_COUNT).fill(null),
  );

  // answers를 handleLoadingComplete의 deps에 넣으면 그 identity가 바뀌고, 그러면
  // LoadingScreen의 [onComplete] effect가 2200ms 타이머를 재시작한다. ref로 읽어
  // identity를 고정한다. saveDiagnosis도 DiagnosisContext에서 [scope] 의존이라
  // 로그인 전환 시 바뀌는데, 같은 이유로 여기서 ref 경유가 안전하다.
  const answersRef = useRef(answers);
  const saveRef = useRef(saveDiagnosis);
  useEffect(() => {
    answersRef.current = answers;
    saveRef.current = saveDiagnosis;
  }, [answers, saveDiagnosis]);

  // 진입 가드는 마운트 1회만(deps []). 세션 내 뒤/앞으로가기는 리마운트가 아니라
  // 재발동하지 않으므로, loading이 '현재' 엔트리일 때는 정상 렌더된다.
  // 딥링크·새로고침으로 전제조건 없는 단계에 들어온 경우만 인삿말로 되돌린다.
  useEffect(() => {
    if (rawStep === null) return; // /onboarding → 인삿말. URL 그대로 둔다
    const broken = !isStep(rawStep) || rawStep === 'loading' || (needsType && !cardType);
    if (broken) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (next: Record<string, string>, opts?: { replace?: boolean }) =>
    setParams(next, opts);

  // 히스토리 첫 엔트리(딥링크)면 뒤로 갈 곳이 없다 → 사이트를 벗어나지 말고 인삿말로.
  // 기기 뒤로가기는 이렇게 막을 수 없어 사이트를 벗어난다(브라우저 기본 동작).
  const goBack = () =>
    location.key === 'default' ? setParams({}, { replace: true }) : navigate(-1);

  // LoadingScreen의 [onComplete] effect가 무관한 리렌더에 2200ms 타이머를 재시작하지
  // 않도록 identity를 고정한다(deps는 setParams뿐 — 나머지는 ref로 읽는다).
  // replace라 loading 엔트리가 소진돼 뒤로가기 덫이 없다.
  const handleLoadingComplete = useCallback(() => {
    const picked = answersRef.current;
    const computed = computeDiagnosis(picked);
    saveRef.current({ ...computed, answers: picked, source: 'quiz' });
    setParams({ step: 'result-msg', type: computed.skinType }, { replace: true });
  }, [setParams]);

  return (
    <div
      className="relative w-full h-[calc(100dvh-var(--safe-top))] overflow-hidden"
      style={{ containerType: 'size' }}
    >
      {/* mode="wait" 없이: 각 화면이 absolute inset-0라 0.5s 크로스페이드된다.
          키는 Step 값 그대로 — q·g를 키에 넣으면 문항마다 크로스페이드가 걸린다. */}
      <AnimatePresence>
        {step === 'greeting' && (
          <GreetingScreen
            key="greeting"
            greetingIndex={greetingIndex}
            onAdvance={() => go({ step: 'greeting', g: String(greetingIndex + 1) })}
            onKnow={() => go({ step: 'grid' })}
            onDontKnow={() => go({ step: 'question', q: '0' })}
          />
        )}
        {step === 'grid' && (
          <TypeGridScreen
            key="grid"
            selectedType={selectedType}
            onSelect={setSelectedType}
            onConfirm={() => {
              // '알아요' 경로: 문답을 건너뛰었으므로 5축은 중립(5), 1순위만 채운다.
              const id = selectedType.id as SkinTypeId;
              saveDiagnosis({
                skinType: id,
                scores: { moisture: 5, oil: 5, sensitivity: 5, pigmentation: 5, trouble: 5 },
                ranks: [{ rank: 1, skinType: id, score: 1 }],
                source: 'preset',
              });
              go({ step: 'result-card', type: id });
            }}
          />
        )}
        {step === 'question' && (
          <QuestionScreen
            key="question"
            qIndex={qIndex}
            answers={answers}
            onPick={(opt) => setAnswers((prev) => prev.map((v, i) => (i === qIndex ? opt : v)))}
            onNext={() =>
              qIndex + 1 >= QUESTION_COUNT
                ? go({ step: 'loading' })
                : go({ step: 'question', q: String(qIndex + 1) })
            }
            onBack={goBack}
          />
        )}
        {step === 'loading' && <LoadingScreen key="loading" onComplete={handleLoadingComplete} />}
        {step === 'result-msg' && cardType && (
          <ResultMessageScreen
            key="result-msg"
            nickname={profile.nickname}
            typeLabel={cardType.label}
            // 일회성 축하 화면이라 replace. 결과 카드에서 뒤로가면 Q6로 간다.
            onAdvance={() => go({ step: 'result-card', type: cardType.id }, { replace: true })}
          />
        )}
        {step === 'result-card' && cardType && (
          <ResultCardScreen
            key="result-card"
            resultType={cardType}
            onClose={() => navigate(HOME)}
            onRecommend={() => navigate(RECOMMEND)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
