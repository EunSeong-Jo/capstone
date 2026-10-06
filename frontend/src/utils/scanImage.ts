/**
 * 사진으로 찾기용 이미지 — 장변 1024px JPEG data URL.
 *
 * 실사진 평가에서 1024px로 줄여도 결론이 같았고, OCR은 3~5배 빨라졌다
 * (장당 17초 → 2초, scripts/IMAGE_MATCH_SUMMARY.md ③). 폰 카메라 원본(수 MB)을
 * 그대로 올리면 서버 크기 제한(2MB)에도 걸린다.
 */
const MAX_SIDE = 1024;
const QUALITY = 0.85;

function draw(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 처리할 수 없어요');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', QUALITY);
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
