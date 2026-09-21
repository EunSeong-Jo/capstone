import { motion } from 'framer-motion'
import type { SkinType } from '../../data/skinTypes'

export default function TypeDisplay({ type }: { type: SkinType }) {
  return (
    <div className="flex flex-col items-center gap-[2cqmin]">
      <motion.img
        key={type.id}
        src={type.image}
        alt={type.label}
        className="select-none"
        style={{ width: 'clamp(162px, 46.8cqmin, 288px)' }}
        draggable={false}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      />
      <p
        className="font-bold text-[clamp(1rem,4.2cqmin,1.3rem)] text-swappy-green"
        style={{ fontFamily: 'var(--font-doodle)' }}
      >
        {type.label}타입
      </p>
      <p className="text-[clamp(0.75rem,3.2cqmin,0.9rem)] text-swappy-green/80">{type.description}</p>
    </div>
  )
}
