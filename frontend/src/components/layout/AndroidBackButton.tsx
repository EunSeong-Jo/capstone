import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

/** 하단 탭의 최상위 화면 — 여기서 뒤로가기를 누르면 이전 화면이 아니라 앱을 닫는다 */
const ROOT_PATHS = new Set(['/', '/home', '/category', '/closet', '/history', '/mypage', '/login', '/onboarding']);

/**
 * 안드로이드 하드웨어 뒤로가기 버튼.
 *
 * 네이티브 앱에서만 동작한다(웹·iOS에서는 아무것도 하지 않는다). 이 처리가 없으면 어느 화면에서든 뒤로가기가
 * 앱을 바로 종료한다. 최상위 탭이면 "앱을 종료하시겠습니까?"를 묻고 확인하면 닫고, 그 밖의 화면이면 라우터 히스토리에서 한 단계 돌아간다.
 * 히스토리가 없는 화면(딥링크로 처음 연 화면)은 홈으로 보낸다.
 *
 * 바텀시트·모달을 먼저 닫는 처리는 하지 않는다 — 시트마다 상태가 각자 있어, 필요해지면 따로 연결한다.
 */
export function AndroidBackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // 리스너는 한 번만 등록하고 최신 경로는 ref로 읽는다(경로가 바뀔 때마다 다시 등록하면 이벤트를 놓칠 수 있다)
  const pathRef = useRef(pathname);
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    confirmingRef.current = confirming;
  }, [confirming]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (confirmingRef.current) {
        setConfirming(false); // 안내가 떠 있을 때 한 번 더 누르면 닫기만 한다
      } else if (ROOT_PATHS.has(pathRef.current)) {
        setConfirming(true);
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

  if (!confirming) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="앱 종료 확인"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-8"
      onClick={() => setConfirming(false)}
    >
      <div
        className="w-full max-w-[320px] rounded-2xl bg-white p-5 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold text-gray-100">앱을 종료하시겠습니까?</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-11 flex-1 rounded-xl bg-gray-5 text-[14px] font-semibold text-gray-70"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void CapacitorApp.exitApp()}
            className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-semibold text-white"
          >
            종료
          </button>
        </div>
      </div>
    </div>
  );
}
