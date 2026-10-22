import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AnalysisDto, analyzeFace, checkPhoto, fetchQuota, setConsent } from '../../api/skinPhoto';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/auth';
import { useCamera, type CameraFailure } from '../../hooks/useCamera';
import { invalidateSkinPhoto, useQuota } from '../../hooks/useSkinPhoto';
import { captureFaceFrame, captureVisibleCanvas, fileToFaceImage, loadImage } from '../../utils/scanImage';
import {
  FACE_HINTS,
  FaceCheck,
  checkFace,
  checkLiveFace,
  preloadLiveModels,
  type FaceGuide,
} from '../../utils/faceCheck';
import {
  FACE_CONSENT_BENEFIT,
  FACE_CONSENT_SUMMARY,
  FACE_CONSENT_TITLE,
} from '../../data/faceConsent';
import { FaceConsentList } from '../skin/FaceConsentSheet';
import SkinAnalysisDetail from '../skin/SkinAnalysisDetail';

/**
 * 문답 뒤에 끼는 선택 단계 — 얼굴 사진으로 AI 피부 분석을 더한다.
 *
 * 건너뛰면 `onDone(null)`이고 진단은 문답(QnA) 100%로 이어진다. 분석을 마치면
 * `onDone(analysis)`로 id를 넘기고, 페이지가 진단 제출에 실어 서버가 QnA와 섞는다.
 *
 * 이 단계가 막는 것과 막지 않는 것
 * --------------------------------
 *  - 동의가 없으면 촬영 전에 동의를 받는다(가입 때 안 했거나 기존 회원).
 *  - 이번 달 횟수를 다 썼으면 촬영하지 않고 건너뛰게 한다.
 *  - 화면의 얼굴 검사(MediaPipe)는 **안내용**이다. 오검출로 사용자를 막지 않도록 경고만 띄우고
 *    분석은 누를 수 있게 둔다 — 최종 판정은 서버(`face_gate.py`)가 하고, 거절은 한도를 쓰지 않는다.
 *  - 원본 사진은 이 컴포넌트의 상태에만 있다. 서버에 저장되지 않고 분석이 끝나면 버려진다.
 *    (업체가 돌려주는 분석 이미지는 서버가 받아 본인 계정에만 보관한다)
 *
 * `deferAnalysis`: 문항 도중에 미리 찍어 두는 용도다. 동의·횟수 확인과 촬영·미리보기까지만 하고
 * **분석(유닛 차감)은 하지 않는다** — 사진을 `onCaptured`로 넘기면 페이지가 진단을 마무리할 때
 * 한 번만 분석한다. 이때 `onDone(null)`은 "찍지 않고 돌아가기"다.
 */
interface FacePhotoScreenProps {
  /** analysis가 null이면 건너뛴 것 */
  onDone: (analysis: AnalysisDto | null) => void;
  onBack: () => void;
  /** 분석하지 않고 촬영한 사진(JPEG data URL)만 넘긴다 */
  deferAnalysis?: boolean;
  onCaptured?: (image: string) => void;
  /**
   * 문답과 무관하게 단독으로 쓸 때(마이페이지) 결과 화면의 문구·버튼.
   * 기본은 문답 흐름용이다("문답 결과와 함께 반영", "결과보러가기").
   */
  standalone?: { doneLabel: string; note: string; applyLabel?: string };
  /** 결과 화면의 보조 버튼 — 이 분석으로 피부타입 진단을 갱신하려는 쪽이 받는다 */
  onApply?: (analysis: AnalysisDto) => void;
}

type View = 'intro' | 'capture' | 'preview' | 'analyzing' | 'result';

/**
 * 촬영 직후 서버의 사전 검증 결과. `unknown`은 검증을 못 한 경우(네트워크·서버 오류)라 막지 않고
 * 화면의 간단 검사로 대신한다.
 */
type Verdict =
  | { status: 'checking' }
  | { status: 'ok'; items: ChecklistItem[] }
  | { status: 'fail'; message: string; items: ChecklistItem[] }
  | { status: 'unknown' };

/** 촬영 직후 체크리스트 한 칸. ok가 null이면 판단하지 못했다 */
interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean | null;
  message: string | null;
}

interface Shot {
  image: string;
  from: 'camera' | 'gallery';
  /** 화면의 얼굴 검사 결과. 서버가 최종 판정한다 */
  check: FaceCheck | null;
}

const LIVE_CHECK_MS = 500;
/** 실시간 검사에 쓰는 이미지의 장변. 작게 줄여 검사 비용을 낮춘다 */
const LIVE_CHECK_SIDE = 640;
/**
 * 얼굴 틀(타원)의 폭·높이 — 영상 상자(3:4)에 대한 비율. 상자가 3:4라 폭과 높이 비율이 같다.
 * **틀에 얼굴을 맞추면 위치·크기 조건이 충족되도록** 정했다: 얼굴(귀~귀)을 틀 폭에 맞추면 검출 상자
 * 폭이 약 65~78%가 되어 크기 기준(65~80%)을 만족하고, 상자 중심이 틀 중심 근처에 온다.
 */
const GUIDE_SIZE = 0.84;
const LIVE_GUIDE: FaceGuide = { cx: 0.5, cy: 0.5, rx: GUIDE_SIZE / 2, ry: GUIDE_SIZE / 2 };


/** 촬영 전에 보여 주는 가이드 — 분석 업체의 요구(정면·조명·가림 없음)와 촬영 화면의 초록불 조건을 풀어 쓴 것 */
const SHOOTING_GUIDE: { title: string; body: string }[] = [
  { title: '얼굴 틀에 맞추기', body: '타원 안에 이마부터 턱까지 얼굴이 모두 들어오고, 틀을 크게 채우면 위치·크기가 ✓로 바뀌어요. 가까이 찍을수록 분석이 정확해요. 얼굴 폭이 화면의 65~80%일 때 가장 좋아요.' },
  { title: '정면 보기', body: '카메라를 똑바로 보고 고개를 기울이거나 돌리거나 들지 마세요.' },
  { title: '표정', body: '입을 다물고 눈을 뜬 채, 편안한 무표정으로 찍어요.' },
  { title: '밝고 고른 조명', body: '얼굴에 그림자가 지지 않는 밝은 곳에서, 한쪽만 밝거나 빛이 번쩍이지 않게 찍어요. 역광은 피해 주세요.' },
  { title: '초점', body: '카메라가 얼굴에 초점을 맞출 때까지 잠시 가만히 있어요. 흔들리면 흐려져요.' },
  { title: '민낯 + 얼굴 가리지 않기', body: '화장은 지우는 게 더 정확해요. 앞머리·마스크·모자·손으로 가리지 않고, 안경은 벗어 주세요.' },
  { title: '한 명만', body: '화면에 한 사람만 나오게 해 주세요.' },
  { title: '꾸준히 같은 조건', body: '비슷한 밝기와 거리에서 찍으면 지난 분석과 비교하기 좋아요.' },
];

/** 카메라를 못 쓰는 이유별 안내 */
const CAMERA_MESSAGES: Record<CameraFailure, string> = {
  insecure: `이 주소(${typeof location === 'undefined' ? '' : location.origin})로는 카메라를 쓸 수 없어요. https나 localhost로 접속해야 해요.`,
  permission:
    '브라우저에서 카메라가 차단돼 있어요. 주소창 왼쪽 자물쇠에서 카메라를 허용한 뒤 다시 시도해 주세요. (OS 설정에서 브라우저의 카메라 접근이 꺼져 있을 수도 있어요)',
  not_found: '카메라를 찾을 수 없어요. 연결을 확인해 주세요.',
  busy: '다른 앱이나 브라우저 탭이 카메라를 쓰고 있어요. 닫고 다시 시도해 주세요.',
  other: '카메라를 켜지 못했어요.',
};

const backIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function FacePhotoScreen({
  onDone,
  onBack,
  deferAnalysis = false,
  onCaptured,
  standalone,
  onApply,
}: FacePhotoScreenProps) {
  const { scope } = useAuth();
  const { quota, loading, failed, reload } = useQuota();

  const [view, setView] = useState<View>('intro');
  const [shot, setShot] = useState<Shot | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  // 사진을 다시 찍으면 앞 사진의 늦은 응답을 버린다
  const verdictSeq = useRef(0);
  const [live, setLive] = useState<FaceCheck | null>(null);
  const [consenting, setConsenting] = useState(false);
  const [consentExpanded, setConsentExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    videoRef,
    ready: cameraReady,
    denied: cameraDenied,
    failure: cameraFailure,
    retry: retryCamera,
  } = useCamera(view === 'capture', 'user');

  // 촬영 화면에서만 카메라 프레임을 주기적으로 검사한다. 앞 검사가 안 끝났으면 건너뛴다.
  useEffect(() => {
    if (view !== 'capture' || !cameraReady) return;
    let alive = true;
    let busy = false;
    void preloadLiveModels();
    const id = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || busy) return;
      busy = true;
      try {
        // 프레임 전체가 아니라 **화면에 보이는 부분**을 본다. 전체를 보면 화면에 충분히 크게 보여도
        // "가까이 와 주세요"가 나오고, 화면을 꽉 채워야 통과한다(노트북 웹캠은 프레임이 넓다).
        const result = await checkLiveFace(captureVisibleCanvas(video, LIVE_CHECK_SIDE), LIVE_GUIDE);
        if (alive) setLive(result);
      } catch {
        // 아직 영상 크기를 모르는 순간 등 — 이번 검사는 건너뛴다
      } finally {
        busy = false;
      }
    }, LIVE_CHECK_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [view, cameraReady, videoRef]);

  const refreshQuota = () => {
    invalidateSkinPhoto(scope);
    reload();
  };

  const agree = async () => {
    setConsenting(true);
    setNotice(null);
    try {
      await setConsent(true);
      // 동의 직후에도 이번 달 횟수를 다 썼을 수 있다(동의 전 분석 기록이 있는 계정). 찍어도 분석할 수
      // 없는 카메라로 보내지 말고 안내 화면(intro)이 이유를 보여 주게 한다.
      const fresh = await fetchQuota().catch(() => null);
      refreshQuota();
      setView(fresh && fresh.remaining <= 0 ? 'intro' : 'capture');
    } catch {
      setNotice('동의를 저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    } finally {
      setConsenting(false);
    }
  };

  /** 서버/네트워크 오류 → 안내와 돌아갈 단계 */
  const handleFailure = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.status === 422) {
        // 사진 검증에서 걸렸다(얼굴 없음·정면 아님·어두움 등). 서버가 한국어 이유를 준다. 한도는 쓰이지 않았다.
        setNotice(`${err.message} 분석 횟수는 차감되지 않았어요.`);
        setView('preview');
        return;
      }
      if (err.status === 402 || err.status === 403) {
        refreshQuota();
        setNotice(err.message);
        setView('intro');
        return;
      }
      if (err.status === 401) {
        setNotice('로그인이 만료됐어요. 사진 없이 진단을 이어 갈게요.');
        setView('intro');
        return;
      }
      if (err.status === 503) {
        setNotice('지금은 사진 분석을 쓸 수 없어요. 문답만으로 진단할게요.');
        setView('intro');
        return;
      }
    }
    setNotice('분석하지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    setView('preview');
  };

  const analyze = async () => {
    if (!shot) return;
    setNotice(null);
    setView('analyzing');
    try {
      const result = await analyzeFace(shot.image);
      refreshQuota();
      setAnalysis(result);
      setView('result');
    } catch (err) {
      handleFailure(err);
    }
  };

  const takePhoto = async (image: string, from: Shot['from']) => {
    let check: FaceCheck | null = null;
    try {
      check = await checkFace(await loadImage(image));
    } catch {
      check = null; // 검사를 못 하면 서버에 맡긴다
    }
    setShot({ image, from, check });
    setNotice(null);
    setView('preview');

    // 촬영한 사진을 서버 AI가 지금 평가한다(분석 때와 같은 기준, 한도 사용 없음). 항목별 결과를 모두
    // 받아 체크리스트로 보여 주고, 하나라도 걸리면 분석으로 보내지 못하게 한다.
    const seq = ++verdictSeq.current;
    setVerdict({ status: 'checking' });
    let server: Awaited<ReturnType<typeof checkPhoto>> | null = null;
    try {
      server = await checkPhoto(image);
    } catch {
      server = null;
    }
    if (seq !== verdictSeq.current) return;
    // 왜 걸렸는지 확인할 수 있게 측정값을 콘솔에 남긴다(F12).
    console.info('photo_check', server ? (server.ok ? 'ok' : server.code) : 'unavailable', server?.metrics);

    const items: ChecklistItem[] = server?.items ?? [];
    const firstFail = items.find((i) => i.ok === false);

    if (firstFail) {
      setVerdict({ status: 'fail', message: firstFail.message ?? '다시 찍어 주세요.', items });
    } else if (server) {
      setVerdict({ status: 'ok', items });
    } else {
      setVerdict({ status: 'unknown' });
    }
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!cameraReady || !video) {
      fileInputRef.current?.click();
      return;
    }
    let image: string;
    try {
      image = captureFaceFrame(video);
    } catch {
      setNotice('카메라 화면을 가져오지 못했어요. 다시 눌러 주세요.');
      return;
    }
    void takePhoto(image, 'camera');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 사진을 다시 골라도 onChange가 오게
    if (!file) return;
    try {
      await takePhoto(await fileToFaceImage(file), 'gallery');
    } catch {
      setNotice('사진을 열 수 없어요. 다른 사진을 골라 주세요.');
    }
  };

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={onFile}
      data-testid="face-file-input"
    />
  );

  // ── 촬영 / 미리보기 / 분석 중 (어두운 카메라 화면) ─────────────────
  if (view === 'capture' || view === 'preview' || view === 'analyzing') {
    const analyzing = view === 'analyzing';
    const showShot = view !== 'capture' && shot;
    const issue = shot?.check && !shot.check.ok ? shot.check : null;
    const guideOk = live?.ok === true;

    return (
      <motion.div
        className="absolute inset-0 flex flex-col overflow-hidden bg-[#111114]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        {view === 'capture' && cameraReady && (
          // 3:4 상자 안에 object-cover로 채운다. 촬영은 이 상자에 **보이는 부분만** 잘라 저장한다
          // (`captureFaceFrame`) — 노트북 웹캠처럼 가로로 넓은 카메라도 화면에 보인 만큼만 찍힌다.
          // 3:4로 잡은 이유: 720p(1280×720) 카메라에서 이 비율로 자르면 540×720이라 업체가 요구하는
          // 짧은 변 480px을 넘는다. 화면 전체를 꽉 채우면(약 9:19) 387px로 모자라 분석이 거절된다.
          <div className="absolute left-0 right-0 top-1/2 aspect-[3/4] -translate-y-1/2 overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-hidden
              // 전면 카메라는 거울처럼 좌우를 뒤집어 보여 준다. 찍히는 사진은 원본 방향이다.
              className="h-full w-full -scale-x-100 object-cover"
            />
          </div>
        )}
        {showShot && (
          <>
            <img
              src={shot.image}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50"
            />
            <img
              src={shot.image}
              alt="촬영한 사진"
              className={`absolute inset-0 h-full w-full object-contain ${shot.from === 'camera' ? '-scale-x-100' : ''}`}
            />
          </>
        )}

        {/* 상단 바 */}
        <div className="relative z-20 px-5" style={{ paddingTop: 'calc(var(--safe-top) + 22px)' }}>
          <div className="flex h-[52px] items-center justify-between py-2">
            <button
              type="button"
              onClick={() => (view === 'capture' ? setView('intro') : setView('capture'))}
              disabled={analyzing}
              aria-label="뒤로"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.12] text-white active:scale-90 disabled:opacity-40"
            >
              {backIcon}
            </button>
            <span className="text-[15px] font-extrabold text-white">AI 얼굴 분석</span>
            <span className="h-9 w-9" />
          </div>
        </div>

        {/* 얼굴 틀 — 영상 상자(3:4)와 같은 자리·크기의 오버레이라 틀과 영상이 어긋나지 않는다.
            틀의 폭·높이는 상자의 `GUIDE_SIZE`배이고, 실시간 검사가 같은 값으로 "틀 안에 들어왔는가"를 본다. */}
        {view === 'capture' && (
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-10 aspect-[3/4] -translate-y-1/2">
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
              style={{
                width: `${GUIDE_SIZE * 100}%`,
                height: `${GUIDE_SIZE * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              }}
            >
              <span
                className={`absolute inset-0 rounded-[50%] border-[3.5px] transition-colors ${guideOk ? 'border-[#4CC38A]' : 'border-white/70'}`}
              />
            </div>
          </div>
        )}

        {/* 안내 문구 — 촬영 중엔 위쪽 한 줄, 미리보기엔 사진을 가리지 않게 위쪽 한 줄 */}
        <div
          className="relative z-10 flex flex-1 flex-col items-center justify-start px-5 pt-2"
        >
          <p className="relative z-20 mb-4 min-h-[20px] text-center text-[13px] font-bold text-white drop-shadow">
            {view === 'preview'
              ? deferAnalysis
                ? '이 사진을 사용할까요?'
                : '이 사진으로 분석할까요?'
              : view === 'capture'
                ? live && !live.ok
                  ? live.hint
                  : '얼굴을 틀 안에 맞춰 주세요'
                : ''}
          </p>
        </div>

        {/* 분석 중에는 사진 위를 덮어 기다려야 한다는 걸 분명히 한다 */}
        {analyzing && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/60">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <p className="text-center text-[13px] font-bold leading-relaxed text-white">
              AI가 사진을 먼저 검증하고
              <br />
              피부를 분석하는 중이에요
              <br />
              <span className="text-[11px] font-normal opacity-80">최대 1분 정도 걸릴 수 있어요</span>
            </p>
          </div>
        )}

        {/* 사전 검증 결과 — 촬영한 사진을 AI가 항목별로 확인한 체크리스트. 통과하지 못한 항목을 보여 준다. */}
        {view === 'preview' && !notice && verdict && verdict.status !== 'unknown' && (
          <div role="status" className="relative z-10 mx-5 mb-2 rounded-2xl bg-black/45 px-4 py-3 text-white backdrop-blur-sm">
            {verdict.status === 'checking' ? (
              <p className="text-center text-[12px] font-semibold text-white/85">
                AI가 사진이 분석에 맞는지 확인하는 중이에요…
              </p>
            ) : (
              <>
                <p
                  className={`text-[13px] font-extrabold drop-shadow ${verdict.status === 'ok' ? 'text-[#7BE0AE]' : 'text-[#FF9FB0]'}`}
                >
                  {verdict.status === 'ok'
                    ? '✓ AI 검증을 통과했어요'
                    : `통과하지 못한 항목 ${verdict.items.filter((i) => i.ok === false).length}개`}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {verdict.items.map((it) => (
                    <li key={it.key} className="text-[12px] leading-snug">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white ${
                            it.ok === true ? 'bg-[#4CC38A]' : it.ok === false ? 'bg-[#FF5C7A]' : 'bg-white/40'
                          }`}
                        >
                          {it.ok === true ? '✓' : it.ok === false ? '✕' : '–'}
                        </span>
                        <span
                          className={`font-semibold drop-shadow ${it.ok === false ? 'text-[#FF9FB0]' : it.ok === null ? 'text-white/60' : 'text-white'}`}
                        >
                          {it.label}
                          {it.ok === null && <span className="ml-1 font-normal">확인 못 함</span>}
                        </span>
                      </span>
                      {it.ok === false && it.message && (
                        <span className="mt-0.5 block pl-6 text-[11px] text-white/85 drop-shadow">{it.message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* 안내·경고 */}
        {(notice || (view === 'preview' && issue && verdict?.status === 'unknown')) && (
          <div className="relative z-10 mx-5 mb-2 rounded-xl bg-white/95 px-4 py-2.5 text-center text-[12px] font-semibold text-gray-100">
            {notice ?? (issue?.issue ? FACE_HINTS[issue.issue] : '')}
            {!notice && issue && (
              <span className="mt-0.5 block text-[11px] font-normal text-gray-50">
                그래도 분석해 볼 수 있어요. 결과가 어려우면 다시 안내해 드려요.
              </span>
            )}
          </div>
        )}
        {view === 'capture' && cameraDenied && (
          <div className="relative z-10 mx-5 mb-2 rounded-xl bg-white/90 px-4 py-2.5 text-center text-[12px] leading-relaxed text-gray-70">
            {CAMERA_MESSAGES[cameraFailure ?? 'other']} 아래 버튼으로 사진을 골라도 돼요.
            {cameraFailure !== 'insecure' && (
              <button
                type="button"
                onClick={retryCamera}
                className="ml-1 font-bold text-ob-green-deep underline underline-offset-2"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {/* 컨트롤 */}
        <div className="relative z-10 px-5" style={{ paddingBottom: 'calc(var(--safe-bottom) + 18px)' }}>
          {view === 'capture' && (
            <div className="flex items-center justify-between px-[22px]">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="갤러리에서 선택"
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/40 active:scale-95"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10" r="1.5" />
                  <path d="M21 16l-5-5-4 4-2-2-4 4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleCapture}
                aria-label="촬영"
                className={`flex h-[70px] w-[70px] items-center justify-center rounded-full border-[4.5px] bg-white/25 active:scale-95 ${guideOk ? 'border-[#4CC38A]' : 'border-white'}`}
              >
                <span className="h-[54px] w-[54px] rounded-full bg-white" />
              </button>
              <span className="h-11 w-11" />
            </div>
          )}
          {view === 'preview' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setView('capture')}
                className="h-12 flex-1 rounded-full bg-white/[0.16] text-[14px] font-semibold text-white active:scale-[.98]"
              >
                다시 찍기
              </button>
              <button
                type="button"
                onClick={() => (deferAnalysis ? shot && onCaptured?.(shot.image) : analyze())}
                disabled={verdict?.status === 'fail'}
                className="h-12 flex-[1.4] rounded-full bg-ob-green text-[14px] font-semibold text-white active:scale-[.98] disabled:opacity-40"
              >
                {deferAnalysis ? '이 사진 사용하기' : '이 사진으로 분석'}
              </button>
            </div>
          )}
        </div>
        {hiddenInput}
      </motion.div>
    );
  }

  // ── 결과 ────────────────────────────────────────────────────────
  if (view === 'result' && analysis) {
    return (
      <motion.div
        className="absolute inset-0 flex flex-col overflow-hidden bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="pt-11" />
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <p className="text-[18px] font-extrabold text-ob-green-deep">분석이 끝났어요</p>
          <p className="mt-1 mb-4 text-[12px] leading-relaxed text-gray-50">
            {standalone?.note ?? '이 결과를 문답 결과와 함께 반영해 피부타입을 정할게요.'}
            {analysis.remaining !== null && ` 이번 달 남은 횟수 ${analysis.remaining}회`}
          </p>
          <SkinAnalysisDetail analysis={analysis} showUpsell />
        </div>
        <div
          className="flex flex-col gap-2 px-5 pt-2"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 25px)' }}
        >
          {onApply && standalone?.applyLabel && (
            <button
              type="button"
              onClick={() => onApply(analysis)}
              className="flex h-12 w-full items-center justify-center rounded-full border border-ob-green text-[13px] font-medium text-ob-green-deep active:scale-[.98]"
            >
              {standalone.applyLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDone(analysis)}
            className="flex h-12 w-full items-center justify-center rounded-full bg-ob-green text-[13px] font-medium text-white active:scale-[.98]"
          >
            {standalone?.doneLabel ?? '결과보러가기'}
          </button>
        </div>
      </motion.div>
    );
  }

  // ── 소개 (동의 · 횟수 확인) ───────────────────────────────────────
  const consentGranted = quota?.consentGranted === true;
  const remaining = quota?.remaining ?? 0;
  const canShoot = consentGranted && remaining > 0;

  // ── 동의 (약식, 어두운 화면) ──────────────────────────────────────
  // 가입 때 동의하지 않은 사람은 카메라를 켜기 전에 여기서 동의를 받는다. 카메라 화면과 같은
  // 검은 배경이라 촬영 흐름이 끊기지 않는다. 핵심 세 줄만 보이고 전문은 펼쳐서 볼 수 있다.
  if (!loading && !failed && quota && !consentGranted) {
    return (
      <motion.div
        className="absolute inset-0 flex flex-col overflow-hidden bg-[#111114]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="relative z-20 px-5" style={{ paddingTop: 'calc(var(--safe-top) + 22px)' }}>
          <div className="flex h-[52px] items-center justify-between py-2">
            <button
              type="button"
              onClick={onBack}
              disabled={consenting}
              aria-label="뒤로"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.12] text-white active:scale-90 disabled:opacity-40"
            >
              {backIcon}
            </button>
            <span className="text-[15px] font-extrabold text-white">AI 얼굴 분석</span>
            <span className="h-9 w-9" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-6">
          <p className="text-[18px] font-extrabold text-white">촬영 전에 동의가 필요해요</p>
          <p className="mt-1 text-[12px] text-white/60">{FACE_CONSENT_TITLE}</p>

          {consentExpanded ? (
            <div className="mt-5 rounded-2xl bg-white/[0.08] p-4 [&_dd]:text-white/70 [&_dt]:text-white">
              <FaceConsentList />
            </div>
          ) : (
            <ul className="mt-5 flex flex-col gap-3">
              {FACE_CONSENT_SUMMARY.map((line) => (
                <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-white/85">
                  <span aria-hidden className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#4CC38A]" />
                  {line}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setConsentExpanded((v) => !v)}
            className="mt-4 text-[12px] font-semibold text-[#4CC38A] underline underline-offset-2"
          >
            {consentExpanded ? '간단히 보기' : '전문 보기'}
          </button>
          <p className="mt-4 text-[11px] leading-relaxed text-white/50">
            동의하지 않아도 문답(QnA) 진단은 그대로 쓸 수 있어요.
          </p>
          {notice && (
            <p className="mt-3 rounded-xl bg-white/95 px-4 py-2.5 text-[12px] font-semibold text-accent">
              {notice}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-5 pt-2" style={{ paddingBottom: 'calc(var(--safe-bottom) + 25px)' }}>
          <button
            type="button"
            onClick={agree}
            disabled={consenting}
            className="flex h-12 w-full items-center justify-center rounded-full bg-ob-green text-[14px] font-semibold text-white active:scale-[.98] disabled:opacity-50"
          >
            {consenting ? '저장하는 중…' : '동의하고 촬영하기'}
          </button>
          <button
            type="button"
            onClick={() => onDone(null)}
            disabled={consenting}
            className="flex h-12 w-full items-center justify-center rounded-full bg-white/[0.12] text-[13px] font-medium text-white active:scale-[.98] disabled:opacity-50"
          >
            {deferAnalysis ? '문항으로 돌아가기' : standalone ? '닫기' : '동의 없이 건너뛰기'}
          </button>
        </div>
        {hiddenInput}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 flex flex-col overflow-hidden bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="pt-11" />
      <div className="px-5">
        <button type="button" onClick={onBack} aria-label="뒤로" className="p-1 text-gray-100">
          {backIcon}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 pt-3">
        <p className="text-[18px] font-extrabold text-ob-green-deep">사진으로 더 정확하게</p>
        <p className="mt-2 text-[14px] font-bold leading-snug text-black">
          얼굴 사진을 AI가 분석해서
          <br />
          문답 결과를 보완해 드려요 <span className="text-[11px] font-normal text-gray-50">(선택)</span>
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-gray-50">
          유분·수분·홍조·잡티·트러블을 사진으로 확인하고, 결과 화면에서 항목별 점수를 볼 수 있어요.
          {deferAnalysis
            ? ' 지금은 촬영만 해 두고, 진단을 마칠 때 분석해요. 촬영만으로는 횟수가 차감되지 않아요.'
            : ' 건너뛰면 문답만으로 진단해요.'}
        </p>

        {notice && (
          <p className="mt-3 rounded-xl bg-accent-light px-4 py-2.5 text-[12px] font-semibold text-accent">
            {notice}
          </p>
        )}

        {loading ? (
          <div className="mt-8 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ob-green border-t-transparent" />
          </div>
        ) : failed || !quota ? (
          <p className="mt-6 rounded-xl bg-gray-5 px-4 py-3 text-[12px] text-gray-70">
            지금은 사진 분석 정보를 불러오지 못했어요. 문답만으로 진단을 이어 갈 수 있어요.
          </p>
        ) : !consentGranted ? (
          <div className="mt-5">
            <p className="text-[13px] font-bold text-gray-100">{FACE_CONSENT_TITLE}</p>
            <p className="mt-1 text-[11px] text-ob-green-deep">{FACE_CONSENT_BENEFIT}</p>
            <div className="mt-3 max-h-[220px] overflow-y-auto rounded-xl border border-gray-20 bg-white p-3">
              <FaceConsentList />
            </div>
          </div>
        ) : remaining <= 0 ? (
          <div className="mt-6 rounded-xl bg-gray-5 px-4 py-3 text-[12px] leading-relaxed text-gray-70">
            이번 달 사진 분석 {quota.allowance}회를 모두 사용했어요.
            <br />
            {new Date(quota.resetsAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}에 다시
            쓸 수 있어요.
            {quota.plan === 'free' && (
              <span className="mt-1 block font-semibold text-ob-green-deep">
                구독하면 매달 4회, 주 1회 AI 피부관리를 받을 수 있어요. (마이페이지 &gt; AI 피부관리)
              </span>
            )}
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-ob-surface px-4 py-3 text-[12px] leading-relaxed text-ob-green-deep">
            이번 달 남은 횟수 <b>{remaining}회</b> · 분석 항목 {quota.concernCount}가지
            <br />
            원본 사진은 저장되지 않고, 분석 이미지는 내 계정에만 보관돼요.
          </p>
        )}

        {!loading && !failed && quota && canShoot && (
          <div className="mt-4 rounded-2xl bg-ob-surface px-4 py-3">
            <p className="text-[13px] font-extrabold text-ob-green-deep">AI가 사진을 먼저 검증해요</p>
            <p className="mt-1 text-[12px] leading-relaxed text-gray-70">
              촬영하는 동안에는 얼굴이 틀에 맞는지만 봐요. 찍은 뒤에 AI가 얼굴이 정면으로 크게 나왔는지,
              손·마스크로 가려지지 않았는지, 조명이 밝고 고른지, 초점이 맞는지를 확인해요. 분석에 맞지 않는
              사진은 외부로 보내기 전에 이유를 알려 드리고, <b>분석 횟수도 차감하지 않아요.</b>
            </p>
          </div>
        )}

        {!loading && !failed && quota && canShoot && (
          <div className="mt-3 rounded-2xl border border-gray-10 px-4 py-3">
            <p className="text-[13px] font-extrabold text-gray-100">촬영 가이드</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {SHOOTING_GUIDE.map((g) => (
                <li key={g.title} className="flex gap-2 text-[12px] leading-relaxed text-gray-70">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ob-green" />
                  <span>
                    <b className="font-bold text-gray-100">{g.title}</b> {g.body}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-5 pt-2" style={{ paddingBottom: 'calc(var(--safe-bottom) + 25px)' }}>
        {!loading && quota && !consentGranted && (
          <button
            type="button"
            onClick={agree}
            disabled={consenting}
            className="flex h-12 w-full items-center justify-center rounded-full bg-ob-green text-[13px] font-medium text-white active:scale-[.98] disabled:opacity-50"
          >
            {consenting ? '저장하는 중…' : '동의하고 촬영하기'}
          </button>
        )}
        {canShoot && (
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setView('capture');
            }}
            className="flex h-12 w-full items-center justify-center rounded-full bg-ob-green text-[13px] font-medium text-white active:scale-[.98]"
          >
            얼굴 촬영하기
          </button>
        )}
        <button
          type="button"
          onClick={() => onDone(null)}
          className="flex h-12 w-full items-center justify-center rounded-full bg-ob-green-soft/40 text-[13px] font-medium text-ob-green-deep active:scale-[.98]"
        >
          {deferAnalysis ? '문항으로 돌아가기' : standalone ? '닫기' : '건너뛰고 결과 보기'}
        </button>
      </div>
    </motion.div>
  );
}
