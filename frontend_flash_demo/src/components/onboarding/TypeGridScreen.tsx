import { motion } from 'framer-motion'
import type { SkinType } from '../../data/skinTypes'
import { skinTypes } from '../../data/skinTypes'
import TypeDisplay from './TypeDisplay'
import TypeGrid from './TypeGrid'
import OnboardingButton from './OnboardingButton'

interface TypeGridScreenProps {
  selectedType: SkinType
  onSelect: (type: SkinType) => void
  onConfirm: () => void
}

export default function TypeGridScreen({ selectedType, onSelect, onConfirm }: TypeGridScreenProps) {
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
      <div className="flex h-full w-full flex-col items-center justify-center gap-[3cqmin] pb-[10cqmin]">
        <TypeDisplay type={selectedType} />
        <TypeGrid types={skinTypes} selectedId={selectedType.id} onSelect={onSelect} />
        <div className="mt-[4cqmin]">
          <OnboardingButton onClick={onConfirm}>선택하기</OnboardingButton>
        </div>
      </div>
    </motion.div>
  )
}
