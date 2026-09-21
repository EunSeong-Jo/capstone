import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SplashScreen from './SplashScreen';

const EXPOSURE_MS = 2800; // 스킵 불가, 데모 스펙 유지

export default function SplashPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // replace: 스플래시가 히스토리에 남으면 /login에서 뒤로 → 스플래시 → 2.8초 후 다시
    // /login이 되어 뒤로 빠져나올 수 없다. 스플래시는 착지 가능한 엔트리면 안 된다.
    const timer = setTimeout(() => navigate('/login', { replace: true }), EXPOSURE_MS);
    return () => clearTimeout(timer);
  }, [navigate]);

  // container-type:size → 자식이 cqmin(앱 프레임 짧은 변) 기준으로 배치된다.
  // body가 max-width 430px 중앙 정렬이므로 w-full로 그 폭을 채운다.
  return (
    <div className="relative w-full h-[calc(100dvh-var(--safe-top))] overflow-hidden" style={{ containerType: 'size' }}>
      <SplashScreen />
    </div>
  );
}
