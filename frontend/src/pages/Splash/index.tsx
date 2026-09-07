import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SplashScreen from './SplashScreen';

const EXPOSURE_MS = 2800; // 스킵 불가, 데모 스펙 유지

export default function SplashPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/login'), EXPOSURE_MS);
    return () => clearTimeout(timer);
  }, [navigate]);

  // container-type:size → 자식이 cqmin(앱 프레임 짧은 변) 기준으로 배치된다.
  // body가 max-width 430px 중앙 정렬이므로 w-full로 그 폭을 채운다.
  return (
    <div className="relative w-full h-dvh overflow-hidden" style={{ containerType: 'size' }}>
      <SplashScreen />
    </div>
  );
}
