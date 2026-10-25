/** 같은 제품의 옵션을 바꿀 때처럼 스크롤을 그대로 두고 싶은 이동이 `navigate(path, { state: KEEP_SCROLL })`로 건다. `ScrollToTop`이 읽는다 */
export const KEEP_SCROLL = { keepScroll: true } as const;
