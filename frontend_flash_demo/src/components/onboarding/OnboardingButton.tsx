import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface OnboardingButtonProps {
  children: ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

export default function OnboardingButton({ children, onClick, variant = 'primary' }: OnboardingButtonProps) {
  const colorClass =
    variant === 'primary'
      ? 'bg-swappy-green text-swappy-beige'
      : 'bg-[#f5c2c7] text-swappy-green'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`rounded-full px-[6cqmin] py-[2.2cqmin] text-[clamp(0.85rem,3.6cqmin,1.05rem)] shadow-sm ${colorClass}`}
      style={{ fontFamily: 'var(--font-doodle)' }}
    >
      {children}
    </motion.button>
  )
}
