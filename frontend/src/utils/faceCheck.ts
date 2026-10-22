/**
 * 얼굴 사진 사전 검사 (브라우저, MediaPipe Face Detector).
 *
 * 촬영 화면이 카메라 프레임마다 "얼굴이 있는가·충분히 가까운가·가운데인가·밝은가"를
 * 보고 안내를 띄우며, 갤러리에서 고른 사진도 같은 검사를 거친다. **사진은 이 기기를
 * 떠나지 않는다** — 검사는 전부 브라우저 안(wasm)에서 일어난다.
 *
 * 서버(`backend/app/services/face_gate.py`)가 같은 규칙으로 **최종 판정**을 한다.
 * 이쪽은 사용자에게 바로 알려 주고 헛된 업로드를 줄이는 용도다 — 화면의 약속만으로는
 * 직접 API를 부르는 요청을 막을 수 없기 때문이다. 그래서 검출기를 불러오지 못하면
 * (`null`) 검사를 건너뛰고 서버에 맡긴다. 규칙·문구는 서버와 같게 유지한다.
 *
 * wasm과 모델은 `public/mediapipe/`에서 같은 출처로 불러온다(`scripts/copy-mediapipe.mjs`).
 * 사진 단계에 들어올 때만 동적으로 읽어 첫 화면 번들에 넣지 않는다.
 */
import type { FaceDetector } from '@mediapipe/tasks-vision';

export type FaceIssue =
  | 'no_face'
  | 'multiple_faces'
  | 'face_too_small'
  | 'face_out_of_frame'
  | 'too_dark'
  // 촬영 화면(`checkLiveFace`)에서만 나온다. 서버 규칙에는 없다.
  | 'face_too_big';

export const FACE_HINTS: Record<FaceIssue, string> = {
  no_face: '얼굴이 보이지 않아요. 정면을 바라봐 주세요.',
  multiple_faces: '한 명만 나오게 해 주세요.',
  face_too_small: '조금 더 가까이 와 주세요.',
  face_out_of_frame: '얼굴 전체가 보이게 가운데로 맞춰 주세요.',
  too_dark: '너무 어두워요. 밝은 곳으로 가 주세요.',
  face_too_big: '너무 가까워요. 조금 뒤로 물러나 주세요.',
};

export interface FaceCheck {
  ok: boolean;
  issue?: FaceIssue;
  /** 사용자에게 보여 줄 한 줄. ok면 없다 */
  hint?: string;
}

// 서버(config.py)와 같은 값. 검출기 상자가 얼굴보다 조금 좁게 잡혀서 Perfect Corp의
// 요구(60%)보다 느슨하게 둔다.
const MIN_WIDTH_RATIO = 0.4;
const MIN_LUMINANCE = 50;
const SECOND_FACE_RATIO = 0.5;
const OUT_OF_FRAME_TOLERANCE = 0.05;
const MIN_SCORE = 0.6;

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;

let detectorPromise: Promise<FaceDetector | null> | null = null;

/** 검출기를 한 번만 만든다. 실패하면 null — 호출하는 쪽은 검사를 건너뛴다. */
export function loadFaceDetector(): Promise<FaceDetector | null> {
  detectorPromise ??= (async () => {
    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      return await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/blaze_face_short_range.tflite' },
        runningMode: 'IMAGE',
        minDetectionConfidence: MIN_SCORE,
      });
    } catch {
      detectorPromise = null; // 다음에 다시 시도할 수 있게
      return null;
    }
  })();
  return detectorPromise;
}

function sizeOf(source: Source): { w: number; h: number } {
  if (source instanceof HTMLVideoElement) return { w: source.videoWidth, h: source.videoHeight };
  if (source instanceof HTMLImageElement) return { w: source.naturalWidth, h: source.naturalHeight };
  return { w: source.width, h: source.height };
}

/** 상자 안의 평균 밝기(0~255). 작게 줄여 그려서 계산한다 */
function luminanceOf(source: Source, box: { x: number; y: number; w: number; h: number }): number | null {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, 32, 32);
    const { data } = ctx.getImageData(0, 0, 32, 32);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return sum / (data.length / 4);
  } catch {
    return null;
  }
}

/** 화면의 얼굴 틀(타원). 좌표는 검사 이미지(= 화면에 보이는 영상)에 대한 0~1 비율 */
export interface FaceGuide {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * 얼굴 틀 맞춤의 여유. 검출 상자는 눈썹~턱·귀 사이를 **직사각형**으로 잡아서, 틀(타원)에 얼굴을
 * 꼭 맞춰도 상자 모서리는 타원 밖으로 나온다. 그래서 모서리가 타원 안인지가 아니라 상자의
 * **중심과 크기**를 틀과 견준다: 중심이 틀 중심에서 `CENTER_TOLERANCE` 안, 폭·높이가 틀의 `SIZE_SLACK`배 이하.
 * 기준은 업체가 정상 처리한 시험 사진(상자 폭 58.8%·높이 62.1%, 중심 0.50·0.53)이 통과하도록 잡았다.
 */
const CENTER_TOLERANCE = 0.12;
const SIZE_SLACK = 1.1;
/**
 * 촬영 화면에서 얼굴이 이미지 폭에서 차지해야 하는 비율 — **서버의 사전 검증과 같은 방식**으로 잰다:
 * 두 눈 사이 거리 ÷ 0.45(귀~귀 폭에 대한 비율)로 어림한 얼굴 폭. 검출 상자 폭은 모델마다 다르게
 * 잡혀서(화면은 MediaPipe, 서버는 YuNet) 화면에서는 통과한 사진이 서버에서 걸리는 원인이 됐다.
 * 눈 사이 거리는 두 모델에서 비슷하게 나오는 값이다.
 *
 * 서버 하한은 60%(업체 요구)다. 얼굴이 크게 찍힐수록 피부 결이 더 많은 픽셀로 잡히니 화면은
 * **하한을 더 높게(64%)** 잡아, 화면에서 통과한 사진이 서버 기준에 여유 있게 들어가게 한다.
 * 상한 85%는 더 가까우면 얼굴이 잘려 업체가 거절하기 때문이다.
 */
const GUIDE_MIN_FACE_WIDTH = 0.64;
const GUIDE_MAX_FACE_WIDTH = 0.85;
/** 귀~귀 얼굴 폭에 대한 두 눈 사이 거리의 비율 — 서버(`face_gate.IPD_PER_FACE_WIDTH`)와 같다 */
const IPD_PER_FACE_WIDTH = 0.45;
/** 눈 위치가 없을 때 상자 폭 → 얼굴 폭 어림 배율(시험 사진: 어림 64.2% ÷ 상자 58.8%) */
const BOX_TO_FACE_WIDTH = 1.09;
/** 눈·코·입 같은 얼굴 특징점이 이미지 가장자리에서 떨어져 있어야 하는 비율 */
const KEYPOINT_MARGIN = 0.02;

const fail = (issue: FaceIssue): FaceCheck => ({ ok: false, issue, hint: FACE_HINTS[issue] });

/**
 * 사진 한 장(또는 영상 한 프레임)을 검사한다.
 * 검출기를 쓸 수 없거나 크기를 모르면 null — "판단하지 않는다"는 뜻이다.
 */
export async function checkFace(source: Source): Promise<FaceCheck | null> {
  const detector = await loadFaceDetector();
  if (!detector) return null;
  const { w, h } = sizeOf(source);
  if (!w || !h) return null;

  let detections;
  try {
    detections = detector.detect(source).detections;
  } catch {
    return null;
  }

  const found = detections
    .filter((d) => d.boundingBox && (d.categories[0]?.score ?? 0) >= MIN_SCORE)
    .map((d) => ({ box: d.boundingBox!, keypoints: d.keypoints ?? [] }))
    .sort((a, b) => b.box.width - a.box.width);
  if (found.length === 0) return fail('no_face');

  const main = found[0].box;
  if (found.length > 1 && found[1].box.width >= main.width * SECOND_FACE_RATIO) {
    return fail('multiple_faces');
  }

  // 얼굴이 화면 밖으로 반쯤 나가도 검출 상자는 화면 안으로 잘려 나온다 — 상자만 보면 "안에 있다"로
  // 읽힌다. 눈·코·입·귀 특징점은 잘린 쪽이 가장자리에 붙거나 어긋나므로 이것도 본다.
  const m = KEYPOINT_MARGIN;
  if (found[0].keypoints.some((k) => k.x < m || k.x > 1 - m || k.y < m || k.y > 1 - m)) {
    return fail('face_out_of_frame');
  }

  const x = main.originX / w;
  const y = main.originY / h;
  const fw = main.width / w;
  const fh = main.height / h;
  const tol = OUT_OF_FRAME_TOLERANCE;
  if (x < -tol || y < -tol || x + fw > 1 + tol || y + fh > 1 + tol) return fail('face_out_of_frame');
  if (fw < MIN_WIDTH_RATIO) return fail('face_too_small');

  const lum = luminanceOf(source, {
    x: Math.max(0, main.originX),
    y: Math.max(0, main.originY),
    w: Math.min(main.width, w - Math.max(0, main.originX)),
    h: Math.min(main.height, h - Math.max(0, main.originY)),
  });
  if (lum !== null && lum < MIN_LUMINANCE) return fail('too_dark');

  return { ok: true };
}


/**
 * 촬영 화면의 실시간 검사 — **얼굴이 틀에 맞는지만** 본다(위치·크기).
 *
 * 움직이는 동안에는 가볍게, 정면·가림·조명·초점 같은 정밀한 평가는 **촬영한 사진에** 한다(서버의 사전
 * 검증과 촬영 직후 가림 검사). 영상 프레임마다 무거운 모델을 돌리면 화면이 느려지고, 움직이는 얼굴은
 * 흔들려서 판정도 불안정하다.
 *
 * `ok`는 위치·크기를 모두 통과했을 때만 true다(초록불).
 */
export async function checkLiveFace(source: Source, guide: FaceGuide): Promise<FaceCheck | null> {
  const detector = await loadFaceDetector();
  if (!detector) return null;
  const { w, h } = sizeOf(source);
  if (!w || !h) return null;

  let detections;
  try {
    detections = detector.detect(source).detections;
  } catch {
    return null;
  }
  const found = detections
    .filter((d) => d.boundingBox && (d.categories[0]?.score ?? 0) >= MIN_SCORE)
    .map((d) => ({ box: d.boundingBox!, keypoints: d.keypoints ?? [] }))
    .sort((a, b) => b.box.width - a.box.width);

  if (found.length === 0) return fail('no_face');
  const main = found[0].box;
  if (found.length > 1 && found[1].box.width >= main.width * SECOND_FACE_RATIO) {
    return fail('multiple_faces');
  }

  const kp = found[0].keypoints; // 순서: 오른쪽 눈, 왼쪽 눈, 코끝, 입 가운데, 오른쪽 귀, 왼쪽 귀
  const x = main.originX / w;
  const y = main.originY / h;
  const fw = main.width / w;
  const fh = main.height / h;

  // 위치: 특징점이 가장자리에 붙지 않고(잘리지 않음), 얼굴 상자의 중심이 틀 중심 근처다.
  const m = KEYPOINT_MARGIN;
  const cut = kp.some((k) => k.x < m || k.x > 1 - m || k.y < m || k.y > 1 - m);
  const centered =
    Math.abs(x + fw / 2 - guide.cx) <= CENTER_TOLERANCE && Math.abs(y + fh / 2 - guide.cy) <= CENTER_TOLERANCE;
  if (cut || !centered) return fail('face_out_of_frame');

  // 얼굴 폭: 서버와 같은 방식(두 눈 사이 거리 ÷ 0.45). 눈 위치가 없으면 상자 폭으로 어림한다.
  let faceWidth = fw * BOX_TO_FACE_WIDTH;
  if (kp.length >= 2) {
    const ipd = Math.hypot((kp[1].x - kp[0].x) * w, (kp[1].y - kp[0].y) * h) / w;
    if (ipd > 0) faceWidth = ipd / IPD_PER_FACE_WIDTH;
  }
  // 너무 가까움: 폭이 상한을 넘거나 상자가 틀보다 크다(틀에 얼굴이 다 들어오지 않는다)
  if (faceWidth > GUIDE_MAX_FACE_WIDTH || fw > guide.rx * 2 * SIZE_SLACK || fh > guide.ry * 2 * SIZE_SLACK) {
    return fail('face_too_big');
  }
  if (faceWidth < GUIDE_MIN_FACE_WIDTH) return fail('face_too_small');

  return { ok: true };
}

/** 촬영 화면에 들어올 때 얼굴 검출 모델을 미리 읽어 둔다 */
export const preloadLiveModels = () => loadFaceDetector();
