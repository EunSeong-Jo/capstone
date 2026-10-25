import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

/** 하단 탭의 최상위 화면 — 여기서 뒤로가기를 누르면 이전 화면이 아니라 앱을 닫는다 */
const ROOT_PATHS = new Set(['/', '/home', '/category', '/closet', '/history', '/mypage', '/login', '/onboarding']);

/**
 * 안드로이드 하드웨어 뒤로가기 버튼.
 *
 * 네이티브 앱에서만 동작한다(웹·iOS에서는 아무것도 하지 않는다). 이 처리가 없으면 어느 화면에서든 뒤로가기가
 * 앱을 바로 종료한다. 최상위 탭이면 앱을 닫고, 그 밖의 화면이면 라우터 히스토리에서 한 단계 돌아간다.
 * 히스토리가 없는 화면(딥링크로 처음 연 화면)은 홈으로 보낸다.
 *
 * 바텀시트·모달을 먼저 닫는 처리는 하지 않는다 — 시트마다 상태가 각자 있어, 필요해지면 따로 연결한다.
 */
export function AndroidBackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // 리스너는 한 번만 등록하고 최신 경로는 ref로 읽는다(경로가 바뀔 때마다 다시 등록하면 이벤트를 놓칠 수 있다)
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (ROOT_PATHS.has(pathRef.current)) {
        void CapacitorApp.exitApp();
      } else if (canGoBack) {
        navigate(-1);
      } else {
        navigate('/home', { replace: true });
      }
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, [navigate]);

  return null;
}
