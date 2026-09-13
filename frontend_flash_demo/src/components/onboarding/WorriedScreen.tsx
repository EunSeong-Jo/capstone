import { motion } from 'framer-motion'
import baseWorried from '../../assets/base/base-worried.png'
import MascotStage from './MascotStage'
import MessageBox from './MessageBox'

export default function WorriedScreen({ onAdvance }: { onAdvance: () => void }) {
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
        <MascotStage src={baseWorried} alt="고민하는 기본 캐릭터" />
        <MessageBox text="그럼 같이 피부타입을 알아보아요!" onAdvance={onAdvance} />
      </div>
    </motion.div>
  )
}
