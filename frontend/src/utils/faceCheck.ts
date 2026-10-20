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
  | 'too_dark';

export const FACE_HINTS: Record<FaceIssue, string> = {
  no_face: '얼굴이 보이지 않아요. 정면을 바라봐 주세요.',
  multiple_faces: '한 명만 나오게 해 주세요.',
  face_too_small: '조금 더 가까이 와 주세요.',
  face_out_of_frame: '얼굴 전체가 보이게 가운데로 맞춰 주세요.',
  too_dark: '너무 어두워요. 밝은 곳으로 가 주세요.',
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

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap;

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

  const faces = detections
    .filter((d) => d.boundingBox && (d.categories[0]?.score ?? 0) >= MIN_SCORE)
    .map((d) => d.boundingBox!)
    .sort((a, b) => b.width - a.width);
  if (faces.length === 0) return fail('no_face');

  const main = faces[0];
  if (faces.length > 1 && faces[1].width >= main.width * SECOND_FACE_RATIO) {
    return fail('multiple_faces');
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
