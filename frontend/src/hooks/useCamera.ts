import { useEffect, useRef, useState } from 'react';

/**
 * 카메라 프리뷰 (기본 후면, 얼굴 촬영은 전면).
 *
 * 인식(OCR)은 아직 없다. 이 훅이 하는 일은 화면에 실제 카메라 영상을 띄우는
 * 것까지다 — 무엇을 비추고 있는지 보이면 제품을 화면에 맞추기 쉽고, 나중에
 * 인식을 붙일 때 이 자리가 그대로 쓰인다.
 *
 * **실패를 숨기지 않는다.** 권한 거부·카메라 없음·비보안 컨텍스트(https가
 * 아닌 곳)를 `denied`로 올리고, 화면은 그때 "카메라를 쓸 수 없어요"라고
 * 알린다. 예전 판은 이런 경우 흐린 목업 사진으로 조용히 대체해서, 사용자가
 * 카메라가 켜진 줄 알았다.
 *
 * 정리
 * ----
 * 언마운트 때 트랙을 반드시 멈춘다. 안 그러면 다른 화면으로 가도 카메라
 * 표시등이 계속 켜져 있다.
 */
/** 카메라를 못 쓰는 이유. 화면이 이유별로 다른 안내를 보여 준다 */
export type CameraFailure =
  | 'insecure' // http(localhost 아님)로 열었다 — getUserMedia 자체가 없다
  | 'permission' // 브라우저·OS가 막았다(NotAllowedError)
  | 'not_found' // 카메라 장치가 없다
  | 'busy' // 다른 앱·탭이 쓰고 있다(NotReadableError)
  | 'other';

export interface UseCameraResult {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  /** 영상이 흐르고 있다 */
  ready: boolean;
  /** 쓸 수 없다 — 권한 거부, 장치 없음, http 접속 등 */
  denied: boolean;
  /** 못 쓰는 이유. 쓸 수 있으면 null */
  failure: CameraFailure | null;
  /** 같은 요청을 다시 보낸다(권한을 바꾸거나 다른 앱을 닫은 뒤) */
  retry: () => void;
}

function classify(err: unknown): CameraFailure {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'permission';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'not_found';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'other';
}

/**
 * http로 열면 getUserMedia 자체가 없다. 브라우저 기능 부족과 같은 처지이고,
 * **요청해 보기 전에 이미 알 수 있는 사실**이라 effect가 아니라 여기서 본다
 * (effect에서 상태로 바꾸면 렌더가 한 번 더 돈다).
 */
const UNSUPPORTED =
  typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia;

export function useCamera(
  enabled = true,
  /** environment=후면(제품 스캔), user=전면(얼굴 촬영) */
  facing: 'environment' | 'user' = 'environment',
): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || UNSUPPORTED) return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    // 얼굴 분석은 해상도 조건이 있다(짧은 변 480px 이상). 전면 카메라는 기본 해상도가
    // 낮은 기기가 있어 이상값을 요청한다 — 못 맞추면 브라우저가 가장 가까운 값을 준다.
    // 그래도 조건 때문에 실패하면(OverconstrainedError·TypeError) 조건 없이 한 번 더 시도한다.
    const constrained: MediaTrackConstraints =
      facing === 'user'
        ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }
        : { facingMode: 'environment' };

    navigator.mediaDevices
      .getUserMedia({ video: constrained, audio: false })
      .catch((err: unknown) => {
        const name = err instanceof Error ? err.name : '';
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError' || name === 'TypeError') {
          return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        throw err;
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setFailure(null);
        setReady(true);
      })
      .catch((err: unknown) => {
        // 원인을 콘솔에 남긴다 — 화면에는 분류한 이유만 보인다.
        console.warn('camera_failed', err instanceof Error ? `${err.name}: ${err.message}` : err);
        if (!cancelled) setFailure(classify(err));
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, [enabled, facing, attempt]);

  /**
   * 화면은 ready가 된 **뒤에** <video>를 그린다. 스트림이 도착한 순간에는
   * videoRef가 아직 비어 있어서 srcObject를 못 붙였고, 카메라 표시등만 켜진 채
   * 검은 화면이 나왔다. 요소가 생긴 뒤(이 effect는 커밋 후에 돈다) 붙인다.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (ready && video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
    }
  });

  const effective: CameraFailure | null = UNSUPPORTED ? 'insecure' : failure;
  return {
    videoRef,
    ready,
    denied: effective !== null,
    failure: effective,
    retry: () => {
      setFailure(null);
      setAttempt((n) => n + 1);
    },
  };
}
