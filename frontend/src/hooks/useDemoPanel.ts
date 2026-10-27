import { useCallback, useRef, useState } from 'react';
import { readJSON, writeJSON } from '../context/storage';

/**
 * 로그인 화면의 '데모 계정으로 바로 로그인' 패널 표시 여부.
 *
 * 시연·테스트용 패널이라 팀원 이름과 공용 비밀번호가 화면에 그대로 보인다. 배포한 앱에서는 숨기되, 시연할 때는 켤 수
 * 있어야 해서 **비밀 명령**으로 켜고 끈다: 로고를 {@link SECRET_TAPS}번 연달아(각 탭 사이 {@link TAP_GAP_MS} 이내) 누른다.
 * 선택은 기기에 저장돼 다음 실행에도 유지된다.
 *
 * 기본값(저장된 선택이 없을 때)은 **숨김**이다. 개발 중에 처음부터 보이게 하려면 빌드 변수
 * `VITE_DEMO_PANEL=on`을 준다. 배포·웹·앱 빌드는 아무 설정 없이도 숨겨진다.
 */
const KEY = 'swappy:ui:demoPanel:v1';
export const SECRET_TAPS = 7;
const TAP_GAP_MS = 1200;

const defaultOn = import.meta.env.VITE_DEMO_PANEL === 'on';

export function useDemoPanel(): {
  visible: boolean;
  /** 로고를 누를 때마다 부른다. 비밀 명령이 완성되면 표시 여부를 뒤집고 새 값을 돌려준다(아니면 null) */
  tapLogo: () => boolean | null;
} {
  const [visible, setVisible] = useState<boolean>(() => {
    const saved = readJSON<'on' | 'off' | null>(KEY, null);
    return saved === null ? defaultOn : saved === 'on';
  });
  const taps = useRef({ count: 0, last: 0 });

  const tapLogo = useCallback(() => {
    const now = Date.now();
    const t = taps.current;
    t.count = now - t.last <= TAP_GAP_MS ? t.count + 1 : 1;
    t.last = now;
    if (t.count < SECRET_TAPS) return null;
    t.count = 0;
    const next = !visible;
    writeJSON(KEY, next ? 'on' : 'off');
    setVisible(next);
    return next;
  }, [visible]);

  return { visible, tapLogo };
}
