import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import baseWorried from '../../assets/base/base-worried.png';
import MascotStage from './MascotStage';

const LOADING_MS = 2200;
const PHOTO_SIZE = 112;
const RING_PAD = 10;

interface LoadingScreenProps {
  /** 없으면 타이머 없이 계속 보여 준다(호출한 쪽이 끝나면 화면을 바꾼다) */
  onComplete?: () => void;
  /**
   * 사진 분석이 들어 있다 → "피부 상태", 문답만이면 "피부 타입".
   * 끝나갈 즈음 부모가 값을 비워도 문구가 바뀌지 않게 처음 값을 붙들어 둔다.
   */
  hasPhoto?: boolean;
  /** 주면 마스코트 대신 작은 원형 사진을 보여 준다(사진 촬영만 하는 AI 피부관리용) */
  photo?: { src: string; mirror?: boolean };
}

// Figma "6. Loading": bg ob-bg, worried 마스코트, "피부 타입을 분석하고 있어요" ob-green-deep, 초록 점 3개.
export default function LoadingScreen({ onComplete, hasPhoto = false, photo }: LoadingScreenProps) {
  const [withPhoto] = useState(hasPhoto || !!photo);

  useEffect(() => {
    if (!onComplete) return;
    const timer = setTimeout(onComplete, LOADING_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-ob-bg"
      style={{
        paddingBottom: 'var(--safe-bottom)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-[4cqmin]">
        {photo ? (
          <div
            className="relative flex items-center justify-center"
            style={{ width: PHOTO_SIZE + RING_PAD * 2, height: PHOTO_SIZE + RING_PAD * 2 }}
          >
            <img
              src={photo.src}
              alt="분석 중인 사진"
              className={`rounded-full object-cover ${photo.mirror ? '-scale-x-100' : ''}`}
              style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}
            />
            <motion.svg
              aria-hidden
              viewBox="0 0 100 100"
              className="absolute inset-0 h-full w-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            >
              <circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="70 226"
                className="stroke-ob-green"
              />
            </motion.svg>
          </div>
        ) : (
          <MascotStage src={baseWorried} alt="분석 중인 기본 캐릭터" />
        )}
        <p className="text-ob-green-deep text-[clamp(0.85rem,3.8cqmin,1.05rem)]">
          {withPhoto ? '피부 상태를 분석하고 있어요' : '피부 타입을 분석하고 있어요'}
        </p>
        {withPhoto && (
          <p className="-mt-[2cqmin] text-center text-[12px] leading-relaxed text-ob-green-deep/70">
            AI가 사진을 검증하고 분석하는 중이에요
            <br />
            최대 1분 정도 걸릴 수 있어요
          </p>
        )}
        <div className="flex gap-[2cqmin]">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-[2.4cqmin] w-[2.4cqmin] rounded-full bg-ob-green"
              animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
