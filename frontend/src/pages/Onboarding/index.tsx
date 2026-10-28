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
import { useDiagnosis } from '../../context/diagnosis';
import { useAuth } from '../../context/auth';
import { ApiError } from '../../api/client';
import { analyzeFace } from '../../api/skinPhoto';
import { invalidateSkinPhoto } from '../../hooks/useSkinPhoto';
import GreetingScreen from '../../components/onboarding/GreetingScreen';
import TypeGridScreen from '../../components/onboarding/TypeGridScreen';
import QuestionScreen from '../../components/onboarding/QuestionScreen';
import LoadingScreen from '../../components/onboarding/LoadingScreen';
import ResultMessageScreen from '../../components/onboarding/ResultMessageScreen';
import ResultCardScreen from '../../components/onboarding/ResultCardScreen';
import FacePhotoScreen from '../../components/onboarding/FacePhotoScreen';

// 인삿말 → (알아요) 타입 그리드 | (몰라요) 질문창 Q1~Q6 → (선택) 얼굴 사진 → 로딩 → 결과 메시지 → 결과 카드
//
// 문항 도중에도 'AI 피부진단' 버튼으로 얼굴 사진을 미리 찍을 수 있다(step=shoot). 찍어 두기만
// 하고 **분석은 진단을 마칠 때 한 번만** 한다(로딩 단계) — 다시 찍어도 횟수가 차감되지 않는다.
// 끝내는 방법은 둘이다: 마지막 문항의 '결과보러가기'(전 문항 + 사진) 또는 '이 사진으로 분석하기'
// (지금까지의 답 + 사진, 남은 문항 건너뜀).
//
// 단계 위치만 URL에 둔다. 그래야 전진마다 히스토리 엔트리가 생겨 기기 뒤로가기가
// 그냥 동작한다 — popstate 리스너도, history.pushState도 필요 없고 뒤로가기 구현은
// navigate(-1) 하나뿐이다. 정확성은 전환마다 push냐 replace냐로 확보한다.
//   ?step=greeting&g=0..2 | grid | question&q=0..5 | shoot&q=0..5 | photo | loading
//   ?step=result-msg&type=<id> | result-card&type=<id>
type Step =
  | 'greeting'
  | 'grid'
  | 'question'
  | 'shoot'
  | 'photo'
  | 'loading'
  | 'result-msg'
  | 'result-card';

const STEPS: readonly string[] = [
  'greeting',
  'grid',
  'question',
  'shoot',
  'photo',
  'loading',
  'result-msg',
  'result-card',
];
const isStep = (v: string | null): v is Step => v !== null && STEPS.includes(v);

const RECOMMEND = '/home'; // 추천 제품 페이지 (앱에서 Home이 피부타입 맞춤 추천을 보여줌)

// null·'abc'·'99' 전부 0으로. 범위 밖 인덱스는 타자 효과·문항 조회를 죽인다.
const clampIndex = (raw: string | null, count: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < count ? n : 0;
};

/** 진단이 1·2순위를 냈고 지금 카드가 그 1순위일 때만 둘 중에 고르게 한다(타입을 직접 고른 경우엔 1순위뿐이다) */
function choicesOf(result: ReturnType<typeof useDiagnosis>['result'], first: SkinType): SkinType[] | undefined {
  if (!result || result.source !== 'quiz' || result.ranks.length < 2) return undefined;
  if (result.ranks[0].skinType !== first.id) return undefined;
  const picked = result.ranks.slice(0, 2).map((r) => skinTypes.find((t) => t.id === r.skinType));
  return picked.every((t): t is SkinType => !!t) ? picked : undefined;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { profile } = useUserProfile();
  const { saveDiagnosis, diagnoseWithPhoto, chooseSkinType, result: diagResult, hasDiagnosis, loading: diagLoading } = useDiagnosis();
  const { scope } = useAuth();

  const rawStep = params.get('step');
  // 결과 화면은 type을 URL에 담아 자기 완결적으로 만든다. 카드 → ✕ → /home → 뒤로가기는
  // HomePage가 마운트되며 이 페이지를 언마운트시키므로 useState로는 복원되지 않는다.
  const cardType: SkinType | null = skinTypes.find((t) => t.id === params.get('type')) ?? null;
  const needsType = rawStep === 'result-msg' || rawStep === 'result-card';
  const step: Step = !isStep(rawStep) || (needsType && !cardType) ? 'greeting' : rawStep;
  const greetingIndex = clampIndex(params.get('g'), GREETING_COUNT);
  const qIndex = clampIndex(params.get('q'), QUESTION_COUNT);

  /**
   * 이미 진단을 마친 사람에게 인삿말을 다시 보여주지 않는다.
   *
   * 로그인은 항상 여기로 온다(`/onboarding`). 진단 기록이 있으면 홈이
   * 목적지다 — 퀴즈를 또 시킬 이유가 없다.
   *
   * `diagLoading`을 먼저 보는 것이 핵심이다. 로그인 직후에는
   * `/diagnosis/latest` 응답 전이라 `hasDiagnosis`가 잠깐 false이고, 그때
   * 판정하면 **다른 기기에서 진단한 사용자가 퀴즈를 다시 본다.**
   *
   * greeting 단계에만 적용한다. 재진단(`/qna` → `step=question`)과 결과
   * 화면은 그대로 열려야 한다.
   */
  const skipGreeting = step === 'greeting' && !diagLoading && hasDiagnosis;

  useEffect(() => {
    if (skipGreeting) navigate('/home', { replace: true });
  }, [skipGreeting, navigate]);

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
  const diagnoseRef = useRef(diagnoseWithPhoto);
  const scopeRef = useRef(scope);
  useEffect(() => {
    answersRef.current = answers;
    saveRef.current = saveDiagnosis;
    diagnoseRef.current = diagnoseWithPhoto;
    scopeRef.current = scope;
  }, [answers, saveDiagnosis, diagnoseWithPhoto, scope]);

  // 문항 도중에 찍어 둔 얼굴 사진(JPEG data URL). **메모리에만** 둔다 — 저장·로그 금지.
  // 화면 표시는 hasShot, 실제 값은 ref(렌더를 일으키지 않고, 로딩 콜백이 identity 고정으로 읽는다).
  const shotRef = useRef<string | null>(null);
  const [hasShot, setHasShot] = useState(false);
  // 사진 분석이 실패해 문항으로 돌아왔을 때 보여 줄 안내
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  // 진단을 마치려고 로딩으로 가기 직전의 문항. 실패하면 거기로 돌아온다.
  const returnQRef = useRef(0);
  // 방금 한 진단이 아직 확정(타입 고르기)되지 않았다. 새로고침하면 사라지므로 그때의 ✕는 취소하지 않는다.
  const unconfirmedRef = useRef(false);

  // 얼굴 사진 분석을 마쳤으면 그 id. 진단 제출에 실려 서버가 QnA와 섞는다. 건너뛰면 null이고
  // 그때는 QnA 100%다. 점수 자체는 들고 있지 않는다 — 서버가 저장된 분석을 읽는다.
  const analysisIdRef = useRef<string | null>(null);
  // 서버 응답을 기다리는 동안 페이지를 떠났으면 결과 화면으로 끌고 오지 않는다.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 진입 가드는 마운트 1회만(deps []). 세션 내 뒤/앞으로가기는 리마운트가 아니라
  // 재발동하지 않으므로, loading이 '현재' 엔트리일 때는 정상 렌더된다.
  // 딥링크·새로고침으로 전제조건 없는 단계에 들어온 경우만 인삿말로 되돌린다.
  useEffect(() => {
    if (rawStep === null) return; // /onboarding → 인삿말. URL 그대로 둔다
    // photo도 loading처럼 문답을 마친 뒤에만 의미가 있다 — 딥링크로는 들어올 수 없다.
    // shoot은 문항 도중에만 의미가 있다(찍은 사진을 들고 돌아갈 답이 새로고침으로 사라진다).
    const broken =
      !isStep(rawStep) ||
      rawStep === 'loading' ||
      rawStep === 'photo' ||
      rawStep === 'shoot' ||
      (needsType && !cardType);
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
  const handleLoadingComplete = useCallback(async () => {
    const picked = answersRef.current;
    const allAnswered = picked.every((v) => v !== null);

    /** 사진 분석·진단이 막혔을 때 문항으로 돌아간다. 쓸 수 없는 사진이면 버린다 */
    const backToQuestion = (message: string, keepShot: boolean) => {
      if (!aliveRef.current) return;
      if (!keepShot) {
        shotRef.current = null;
        analysisIdRef.current = null;
        setHasShot(false);
      }
      setPhotoNotice(message);
      setParams({ step: 'question', q: String(returnQRef.current) }, { replace: true });
    };

    let analysisId = analysisIdRef.current ?? undefined;

    // 문항 도중에 찍어 둔 사진은 지금 처음 분석한다(유닛 차감은 여기서 한 번).
    const shot = shotRef.current;
    if (!analysisId && shot) {
      try {
        const analysis = await analyzeFace(shot);
        analysisId = analysis.analysisId;
        analysisIdRef.current = analysisId;
        invalidateSkinPhoto(scopeRef.current);
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) {
          // 사진 문제(얼굴 없음·어두움 등). 서버가 한국어 이유를 주고, 횟수는 쓰이지 않았다.
          backToQuestion(`${err.message} 분석 횟수는 차감되지 않았어요.`, false);
        } else if (err instanceof ApiError && (err.status === 402 || err.status === 403)) {
          invalidateSkinPhoto(scopeRef.current);
          backToQuestion(`${err.message} 문답만으로 진단할 수 있어요.`, false);
        } else if (err instanceof ApiError && err.status === 503) {
          backToQuestion('지금은 사진 분석을 쓸 수 없어요. 문답만으로 진단할 수 있어요.', false);
        } else {
          backToQuestion('분석하지 못했어요. 잠시 뒤에 다시 시도해 주세요.', true);
        }
        return;
      }
    }

    // 건너뛴 문항이 있어도 사진 없이 진단할 수 있다 — 답한 문항만 점수에 닿고 나머지는 '보통'(5)이다.
    // 하나도 안 답했고 사진도 없으면 근거가 없어 문항으로 돌려보낸다.
    const answeredAny = picked.some((v) => v !== null);
    if (!allAnswered && !analysisId && !answeredAny) {
      backToQuestion('답한 문항이 없어요. 하나 이상 답하거나 사진을 찍어 주세요.', false);
      return;
    }

    let skinType: string;
    if (allAnswered || !analysisId) {
      // 전 문항 답함, 또는 일부만 답하고 사진 없음 — 로컬 채점 경로. 사진이 있으면 서버가 QnA와 섞고, 없으면 QnA 100%다.
      const computed = computeDiagnosis(picked);
      const saved = saveRef.current(
        { ...computed, answers: picked, source: 'quiz' },
        analysisId ? { analysisId } : undefined,
      );
      // 로컬 채점은 문답뿐이다. 사진을 섞은 진단은 서버만 최종 타입을 알 수 있어서 기다린다
      // (안 그러면 결과 화면이 문답 타입을 보여 주다가 서버 값으로 바뀐다). 서버가 실패하면
      // saveDiagnosis가 로컬 결과로 풀리므로 여기서 멈추지 않는다.
      skinType = (analysisId ? await saved : computed).skinType;
    } else {
      // 일부만 답하고(또는 하나도 안 답하고) 사진으로 마무리 — 로컬 채점으로는 사진을 섞을 수
      // 없어서 서버 결과만 쓴다. 실패하면 가짜 결과 대신 문항으로 돌려보낸다.
      try {
        skinType = (await diagnoseRef.current(picked, analysisId)).skinType;
      } catch {
        backToQuestion('진단을 저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.', true);
        return;
      }
    }
    if (!aliveRef.current) return;
    // 진단이 끝났으니 사진과 분석 id를 비운다 — 뒤로 가서 다시 진단할 때 남의 것처럼 섞이지 않게.
    shotRef.current = null;
    analysisIdRef.current = null;
    setHasShot(false);
    unconfirmedRef.current = true;
    setParams({ step: 'result-msg', type: skinType }, { replace: true });
  }, [setParams]);

  /** 로딩 단계로 가서 (사진이 있으면 분석 →) 진단을 마친다. 실패하면 이 문항으로 돌아온다 */
  const beginFinish = () => {
    returnQRef.current = qIndex;
    setPhotoNotice(null);
    setParams({ step: 'loading' }, { replace: true });
  };

  // 인삿말을 띄웠다가 곧바로 홈으로 튕기면 화면이 한 번 번쩍인다. 판정이
  // 끝날 때까지, 그리고 건너뛰기로 결정된 뒤에는 인삿말을 그리지 않는다.
  if (step === 'greeting' && (diagLoading || skipGreeting)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ob-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-ob-green border-t-transparent" />
      </div>
    );
  }

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
            onNext={() => {
              if (qIndex + 1 < QUESTION_COUNT) return go({ step: 'question', q: String(qIndex + 1) });
              // 이미 찍어 둔 사진이 있으면 끝의 사진 단계를 건너뛰고 바로 분석·진단한다.
              return hasShot ? beginFinish() : go({ step: 'photo' });
            }}
            onBack={goBack}
            photoReady={hasShot}
            photoNotice={photoNotice}
            onPhoto={() => go({ step: 'shoot', q: String(qIndex) })}
            onClearPhoto={() => {
              shotRef.current = null;
              analysisIdRef.current = null;
              setHasShot(false);
            }}
            onAnalyzeNow={beginFinish}
          />
        )}
        {step === 'shoot' && (
          <FacePhotoScreen
            key="shoot"
            deferAnalysis
            onBack={goBack}
            onDone={goBack}
            onCaptured={(image) => {
              shotRef.current = image;
              analysisIdRef.current = null; // 새 사진은 아직 분석 전이다
              setHasShot(true);
              setPhotoNotice(null);
              goBack();
            }}
          />
        )}
        {step === 'photo' && (
          <FacePhotoScreen
            key="photo"
            onBack={goBack}
            onDone={(analysis) => {
              analysisIdRef.current = analysis?.analysisId ?? null;
              // replace: 사진 단계가 히스토리에 남지 않아 결과 카드에서 뒤로가면 Q6로 간다.
              setParams({ step: 'loading' }, { replace: true });
            }}
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
            choices={choicesOf(diagResult, cardType)}
            onConfirm={async (id) => {
              // 1순위 그대로면 이미 저장돼 있다. 2순위를 골랐을 때만 서버에 확정한다.
              if (id !== cardType.id) {
                try {
                  await chooseSkinType(id as SkinTypeId);
                } catch {
                  return false;
                }
              }
              unconfirmedRef.current = false;
              navigate(RECOMMEND);
              return true;
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
