import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface OnboardingButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

// Figma "2. Greeting": primary bg ob-green / 텍스트 ob-cream, secondary bg ob-green-soft / 텍스트 ob-green-deep.
export default function OnboardingButton({
  children,
  onClick,
  variant = 'primary',
}: OnboardingButtonProps) {
  const colors =
    variant === 'primary'
      ? 'bg-ob-green text-ob-cream'
      : 'bg-ob-green-soft text-ob-green-deep';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`rounded-full px-[6cqmin] py-[2.2cqmin] text-[clamp(0.85rem,3.6cqmin,1.05rem)] ${colors}`}
    >
      {children}
    </motion.button>
  );
}
