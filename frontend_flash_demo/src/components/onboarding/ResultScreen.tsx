import { motion } from 'framer-motion'
import type { SkinType } from '../../data/skinTypes'
import TypeDisplay from './TypeDisplay'
import OnboardingButton from './OnboardingButton'

interface ResultScreenProps {
  resultType: SkinType
  onConfirm: () => void
  onRetry: () => void
}

export default function ResultScreen({ resultType, onConfirm, onRetry }: ResultScreenProps) {
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
      <div className="flex h-full w-full flex-col items-center justify-center gap-[5cqmin] pb-[6cqmin]">
        <motion.div
          className="relative flex flex-col items-center overflow-hidden rounded-[6cqmin] bg-swappy-beige px-[7cqmin] py-[6cqmin] shadow-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <TypeDisplay type={resultType} />
          <motion.div
            className="pointer-events-none absolute inset-0 bg-white"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
          />
        </motion.div>
        <div className="flex gap-[3cqmin]">
          <OnboardingButton onClick={onConfirm}>선택하기</OnboardingButton>
          <OnboardingButton variant="secondary" onClick={onRetry}>
            다시하기
          </OnboardingButton>
        </div>
      </div>
    </motion.div>
  )
}
