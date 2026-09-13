import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface OnboardingButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

// Figma "2. Greeting": primary bg #00916d / 텍스트 #f4e9d8, secondary bg #8fcfb7 / 텍스트 #2d7a4f.
export default function OnboardingButton({
  children,
  onClick,
  variant = 'primary',
}: OnboardingButtonProps) {
  const colors =
    variant === 'primary'
      ? { background: '#00916d', color: '#f4e9d8' }
      : { background: '#8fcfb7', color: '#2d7a4f' };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className="rounded-full px-[6cqmin] py-[2.2cqmin] text-[clamp(0.85rem,3.6cqmin,1.05rem)]"
      style={colors}
    >
      {children}
    </motion.button>
  );
}
