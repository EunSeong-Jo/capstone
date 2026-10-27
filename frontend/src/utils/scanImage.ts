/**
 * 사진으로 찾기용 이미지 — 장변 1024px JPEG data URL.
 *
 * 실사진 평가에서 1024px로 줄여도 결론이 같았고, OCR은 3~5배 빨라졌다
 * (장당 17초 → 2초, scripts/IMAGE_MATCH_SUMMARY.md ③). 폰 카메라 원본(수 MB)을
 * 그대로 올리면 서버 크기 제한(2MB)에도 걸린다.
 */
const MAX_SIDE = 1024;
const QUALITY = 0.85;

function draw(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide = MAX_SIDE,
  quality = QUALITY,
): string {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 처리할 수 없어요');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** 카메라 화면 한 장면 */
export function captureVideoFrame(video: HTMLVideoElement): string {
  if (!video.videoWidth || !video.videoHeight) throw new Error('카메라 화면이 아직 준비되지 않았어요');
  return draw(video, video.videoWidth, video.videoHeight);
}

/** 갤러리에서 고른 사진 */
export async function fileToScanImage(file: File): Promise<string> {
  // 폰 사진의 회전 정보(EXIF)를 반영해 그린다 — 옆으로 누운 글자는 OCR이 못 읽는다.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return draw(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * 얼굴 분석용 사진.
 *
 * 제품 스캔(장변 1024px)보다 크게 둔다 — 분석 업체는 짧은 변 480px(HD는 1080px)
 * 이상을 요구하고, 얼굴 결이 보여야 점수가 안정적이다. 서버는 한 장을 2MB까지만
 * 받으므로(`decode_photo`) 장변 1600px·품질 0.9(대략 0.3~0.8MB)에서 멈춘다.
 */
const FACE_MAX_SIDE = 1600;
const FACE_QUALITY = 0.9;

/**
 * 미리보기 `<video>`에 **보이는** 영역(카메라 프레임 좌표).
 *
 * 미리보기는 `object-cover`로 상자를 채우느라 프레임의 가장자리를 잘라 보여 준다. 상자
 * (`clientWidth×clientHeight`)에 보이는 영역을 같은 계산(가운데 기준 cover)으로 구한다.
 */
function visibleRegion(video: HTMLVideoElement) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  if (cw && ch) {
    const scale = Math.max(cw / vw, ch / vh); // object-fit: cover
    sw = Math.min(vw, cw / scale);
    sh = Math.min(vh, ch / scale);
    sx = (vw - sw) / 2;
    sy = (vh - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

/** 보이는 영역만 장변 `maxSide` 이하의 캔버스에 그린다 */
export function captureVisibleCanvas(video: HTMLVideoElement, maxSide: number): HTMLCanvasElement {
  if (!video.videoWidth || !video.videoHeight) throw new Error('카메라 화면이 아직 준비되지 않았어요');
  const { sx, sy, sw, sh } = visibleRegion(video);
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * k);
  canvas.height = Math.round(sh * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 처리할 수 없어요');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * 카메라 화면 한 장면 — **화면에 보이는 부분만**. 프레임 전체를 저장하면 보이지 않던 부분까지
 * 찍힌다(가로로 넓은 노트북 웹캠에서 특히 심하다).
 *
 * 전면 카메라 미리보기는 좌우를 뒤집어 보여 주지만 **사진은 원본 방향**이다.
 */
export function captureFaceFrame(video: HTMLVideoElement): string {
  return captureVisibleCanvas(video, FACE_MAX_SIDE).toDataURL('image/jpeg', FACE_QUALITY);
}

/** 갤러리에서 고른 얼굴 사진 (회전 정보를 반영해 그린다 — 다시 그리면 EXIF·위치 정보도 빠진다) */
export async function fileToFaceImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return draw(bitmap, bitmap.width, bitmap.height, FACE_MAX_SIDE, FACE_QUALITY);
  } finally {
    bitmap.close();
  }
}

/** data URL → 이미지 요소 (사전 검사에 넘길 때 쓴다) */
export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 읽을 수 없어요'));
    img.src = dataUrl;
  });
}
