import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { useToast } from '../context/toast';

/**
 * 로그인 전용 기능의 안내.
 *
 * 화장대·예산·추천세트·꾸미기·사진으로 찾기·구매·선물은 로그인한 사용자만 쓴다(개인 데이터를
 * 저장하거나, 호출 비용이 드는 기능). 비회원이 누르면 막고 로그인을 권한다 — 로그인하면
 * 지금 화면으로 돌아온다.
 */
export function useLoginPrompt() {
  const { isUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const goLogin = useCallback(
    () => navigate('/login', { state: { from: location.pathname } }),
    [navigate, location.pathname],
  );

  const prompt = useCallback(
    (message = '로그인하면 쓸 수 있어요') => showToast(message, { label: '로그인', onClick: goLogin }),
    [showToast, goLogin],
  );

  /** 비회원이면 안내하고 true. `if (requireLogin(...)) return;`처럼 쓴다 */
  const requireLogin = useCallback(
    (message?: string) => {
      if (isUser) return false;
      prompt(message);
      return true;
    },
    [isUser, prompt],
  );

  return { isUser, prompt, requireLogin, goLogin };
}
