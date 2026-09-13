import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTypewriter } from '../../hooks/useTypewriter';

interface MessageBoxProps {
  text: string;
  onAdvance?: () => void;
  footer?: ReactNode;
}

// Figma "2. Greeting" 시안: 배경 #e7f5f0, 텍스트 #2d7a4f, radius ~11px,
// shadow 0 0 1px rgba(0,0,0,.7). 폰트는 기본 산세리프(두들 미사용).
export default function MessageBox({ text, onAdvance, footer }: MessageBoxProps) {
  const { displayed, isComplete, complete } = useTypewriter(text);

  function handleTap() {
    if (!isComplete) complete();
    else onAdvance?.();
  }

  return (
    <div className="flex flex-col items-center gap-[3cqmin] px-[6cqmin]">
      <motion.div
        onClick={handleTap}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full cursor-pointer rounded-[3cqmin] px-[5cqmin] py-[4cqmin] text-center"
        style={{ background: '#e7f5f0', boxShadow: '0 0 1px rgba(0,0,0,0.7)' }}
      >
        <p
          className="whitespace-pre-line text-[clamp(0.85rem,3.8cqmin,1.05rem)]"
          style={{ color: '#2d7a4f' }}
        >
          {displayed}
        </p>
      </motion.div>
      {isComplete && footer}
    </div>
  );
}
