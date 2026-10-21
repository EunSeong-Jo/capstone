import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AnalysisDto, analyzeFace, fetchQuota, setConsent } from '../../api/skinPhoto';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/auth';
import { useCamera } from '../../hooks/useCamera';
import { invalidateSkinPhoto, useQuota } from '../../hooks/useSkinPhoto';
import { captureFaceFrame, fileToFaceImage, loadImage } from '../../utils/scanImage';
import { FACE_HINTS, FaceCheck, checkFace, loadFaceDetector } from '../../utils/faceCheck';
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

interface Shot {
  image: string;
  from: 'camera' | 'gallery';
  /** 화면의 얼굴 검사 결과. 서버가 최종 판정한다 */
  check: FaceCheck | null;
}

const LIVE_CHECK_MS = 500;

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
  const [live, setLive] = useState<FaceCheck | null>(null);
  const [consenting, setConsenting] = useState(false);
  const [consentExpanded, setConsentExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { videoRef, ready: cameraReady, denied: cameraDenied } = useCamera(view === 'capture', 'user');

  // 촬영 화면에서만 카메라 프레임을 주기적으로 검사한다. 앞 검사가 안 끝났으면 건너뛴다.
  useEffect(() => {
    if (view !== 'capture' || !cameraReady) return;
    let alive = true;
    let busy = false;
    void loadFaceDetector();
    const id = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || busy) return;
      busy = true;
      try {
        const result = await checkFace(video);
        if (alive) setLive(result);
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
        // 사진 문제(얼굴 없음·어두움 등)다. 서버가 한국어 이유를 준다. 한도는 쓰이지 않았다.
        setNotice(err.message);
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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-hidden
            // 전면 카메라는 거울처럼 좌우를 뒤집어 보여 준다. 찍히는 사진은 원본 방향이다.
            className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          />
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

        {/* 가이드 — 촬영 중엔 가운데 틀, 미리보기엔 사진을 가리지 않게 위쪽 한 줄 */}
        <div
          className={`relative z-10 flex flex-1 flex-col items-center px-5 ${
            view === 'capture' ? 'justify-center' : 'justify-start pt-2'
          }`}
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
          {view === 'capture' && (
            <div
              className="relative h-[330px] w-[250px] rounded-[50%]"
              style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
            >
              <span
                className={`absolute inset-0 rounded-[50%] border-[3.5px] transition-colors ${guideOk ? 'border-[#4CC38A]' : 'border-white/70'}`}
              />
            </div>
          )}
        </div>

        {/* 분석 중에는 사진 위를 덮어 기다려야 한다는 걸 분명히 한다 */}
        {analyzing && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/60">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <p className="text-center text-[13px] font-bold leading-relaxed text-white">
              AI가 피부를 분석하는 중이에요
              <br />
              <span className="text-[11px] font-normal opacity-80">최대 1분 정도 걸릴 수 있어요</span>
            </p>
          </div>
        )}

        {/* 안내·경고 */}
        {(notice || (view === 'preview' && issue)) && (
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
            카메라를 쓸 수 없어요. 권한을 확인하거나 아래 버튼으로 사진을 골라 주세요.
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
                className="h-12 flex-[1.4] rounded-full bg-ob-green text-[14px] font-semibold text-white active:scale-[.98]"
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
