import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** 열고 닫을 때 높이가 부드럽게 늘고 줄어드는 영역. `open`이 false면 아무것도 그리지 않는다 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
