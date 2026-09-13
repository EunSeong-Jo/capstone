import { motion } from 'framer-motion'

export default function QnaPlaceholder({ onAdvance }: { onAdvance: () => void }) {
  return (
    <motion.div
      onClick={onAdvance}
      className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-[3cqmin] overflow-hidden bg-white"
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
      <p className="text-[clamp(0.85rem,3.8cqmin,1.05rem)] text-swappy-green/70">
        QnA 영역 (추후 연동 예정)
      </p>
      <p className="text-[clamp(0.7rem,3cqmin,0.85rem)] text-swappy-green/50">탭하여 계속하기</p>
    </motion.div>
  )
}
