import { ReactElement, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/ToastContext';

/**
 * 마이페이지 이하 화면은 계정 정보를 다루므로 게스트("로그인 없이 둘러보기")는
 * 못 들어오게 막는다. 로그인 페이지로 보내고, 로그인 후 원래 가려던 곳으로
 * 돌아올 수 있게 목적지를 state로 들려 보낸다.
 */
export function RequireAuth({ children }: { children: ReactElement }) {
  const { isUser } = useAuth();
  const location = useLocation();
  const { showToast } = useToast();
  const notified = useRef(false);

  useEffect(() => {
    if (!isUser && !notified.current) {
      notified.current = true;
      showToast('로그인이 필요한 화면이에요');
    }
  }, [isUser, showToast]);

  if (!isUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
