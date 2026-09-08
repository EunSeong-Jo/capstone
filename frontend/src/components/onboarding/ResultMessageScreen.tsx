import { motion } from 'framer-motion';
import baseResult from '../../assets/base/base-result.png';
import MascotStage from './MascotStage';
import MessageBox from './MessageBox';

// 프레젠테이션 컴포넌트로 유지 — 닉네임은 페이지가 Context에서 읽어 내려준다.
export default function ResultMessageScreen({
  nickname,
  typeLabel,
  onAdvance,
}: {
  nickname: string;
  typeLabel: string;
  onAdvance: () => void;
}) {
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
      <div className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqmin]">
        <MascotStage src={baseResult} alt="결론 기본 캐릭터" />
        <MessageBox text={`${nickname}님의 타입은 ${typeLabel}타입이에요!!`} onAdvance={onAdvance} />
      </div>
    </motion.div>
  );
}
