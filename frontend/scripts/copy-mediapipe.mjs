// MediaPipe wasm을 public/mediapipe/wasm 으로 복사한다 (npm install 직후 실행).
//
// 얼굴 사진 단계의 브라우저 사전 검사(src/utils/faceCheck.ts)가 이 파일들을 같은 출처에서
// 불러온다. CDN에 기대지 않는 이유: 얼굴 검사가 외부 서버 장애에 묶이지 않게 하고,
// 앱이 어떤 외부 주소도 부르지 않는다고 말할 수 있게 하기 위해서다. 약 40MB라 저장소에는
// 커밋하지 않는다(.gitignore). 복사가 실패해도 설치는 깨뜨리지 않는다 — 얼굴 검사는
// 불러오지 못하면 건너뛰고 서버가 최종 판정한다.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(root, 'public', 'mediapipe', 'wasm');

try {
  if (!existsSync(from)) {
    console.warn('[copy-mediapipe] @mediapipe/tasks-vision이 없어 건너뜁니다.');
  } else {
    mkdirSync(to, { recursive: true });
    cpSync(from, to, { recursive: true });
    console.log('[copy-mediapipe] wasm →', to);
  }
} catch (err) {
  console.warn('[copy-mediapipe] 복사하지 못했습니다:', err.message);
}
