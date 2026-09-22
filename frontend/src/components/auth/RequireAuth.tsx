import { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth';

/**
 * 계정 정보를 다루는 화면을 게스트("로그인 없이 둘러보기")로부터 막는다.
 * 로그인 화면으로 보내면서 원래 가려던 곳을 state로 들려 보낸다.
 *
 * `loading`을 반드시 먼저 본다. 새로고침 직후에는 토큰만 있고 계정 정보가
 * 아직 없어서 `isUser`가 잠깐 false다 — 그때 튕겨 내면 **로그인한 사용자가
 * 주소창으로 마이페이지를 열 때마다 로그인 화면으로 쫓겨난다.**
 */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { isUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <span className="text-[13px] text-gray-50">불러오는 중…</span>
      </div>
    );
  }

  if (!isUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
