import { AnimatePresence, motion } from 'framer-motion'

const MASCOT_WIDTH = 'clamp(120px, 34cqmin, 220px)'

export default function MascotStage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex h-[22cqh] items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.img
          key={src}
          src={src}
          alt={alt}
          className="select-none"
          style={{ width: MASCOT_WIDTH }}
          draggable={false}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{
            opacity: 1,
            y: [0, -12, 0],
          }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{
            opacity: { duration: 0.3 },
            default: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      </AnimatePresence>
    </div>
  )
}
