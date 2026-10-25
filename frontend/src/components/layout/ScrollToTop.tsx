import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * 화면(경로)이 바뀌면 맨 위에서 시작한다.
 *
 * 이 앱은 창 전체가 스크롤되는 SPA라서, 경로를 바꿔도 **스크롤 위치가 그대로 남는다.** 상세 페이지를 아래까지 내려
 * 버튼을 눌러 성분 분석으로 들어오면 분석 화면이 그 높이에서 시작해 위쪽이 안 보인다.
 *
 * 새로 들어가는 이동(PUSH·REPLACE)만 맨 위로 보낸다. 뒤로가기(POP)는 브라우저가 이전 위치를 되살리도록 둔다.
 * 같은 경로 안에서 쿼리만 바뀌는 이동(탭·단계 전환)은 건드리지 않는다.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const type = useNavigationType();

  useEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0);
    // 경로가 바뀔 때만 본다(쿼리·해시만 바뀌는 이동은 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
