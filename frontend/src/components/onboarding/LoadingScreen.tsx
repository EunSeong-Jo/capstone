import { useEffect } from 'react';
import { motion } from 'framer-motion';
import baseWorried from '../../assets/base/base-worried.png';
import MascotStage from './MascotStage';

const LOADING_MS = 2200;

// Figma "6. Loading": bg ob-bg, worried 마스코트, "피부 타입을 분석하고 있어요" ob-green-deep, 초록 점 3개.
export default function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
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
        <MascotStage src={baseWorried} alt="분석 중인 기본 캐릭터" />
        <p className="text-ob-green-deep text-[clamp(0.85rem,3.8cqmin,1.05rem)]">
          피부 타입을 분석하고 있어요
        </p>
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
