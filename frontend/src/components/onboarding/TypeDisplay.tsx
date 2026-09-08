import { motion } from 'framer-motion';
import type { SkinType } from '../../data/skinTypes';

// Figma "3.TypeGrid / 8.Result card": 타입명은 Rubik Doodle Shadow / #2d7a4f,
// 설명은 rgba(45,122,79,0.8).
export default function TypeDisplay({ type }: { type: SkinType }) {
  return (
    <div className="flex flex-col items-center gap-[2cqmin]">
      <motion.img
        key={type.id}
        src={type.image}
        alt={type.label}
        className="select-none"
        style={{ width: 'clamp(140px, 42cqmin, 240px)' }}
        draggable={false}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      />
      <p
        className="text-[clamp(1rem,4.2cqmin,1.3rem)]"
        style={{ fontFamily: "'Rubik Doodle Shadow', system-ui, sans-serif", color: '#2d7a4f' }}
      >
        {type.label}타입
      </p>
      <p
        className="text-center text-[clamp(0.72rem,3cqmin,0.88rem)]"
        style={{ color: 'rgba(45,122,79,0.8)' }}
      >
        {type.description}
      </p>
    </div>
  );
}
