import { motion } from 'framer-motion'
import baseResult from '../../assets/base/base-result.png'
import type { SkinType } from '../../data/skinTypes'
import MascotStage from './MascotStage'
import MessageBox from './MessageBox'

export default function ResultMessageScreen({
  resultType,
  onAdvance,
}: {
  resultType: SkinType
  onAdvance: () => void
}) {
  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqmin]">
        <MascotStage src={baseResult} alt="결론 기본 캐릭터" />
        <MessageBox text={`OO님의 타입은 ${resultType.label}타입이에요!!`} onAdvance={onAdvance} />
      </div>
    </motion.div>
  )
}
