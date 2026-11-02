import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

/**
 * 막대 채움. 부모가 `relative overflow-hidden`인 트랙이어야 한다. **화면에 보이기 시작할 때** 0에서 `percent`까지 차오른다.
 * "동작 줄이기" 설정이면 처음부터 채워진 상태로 보인다.
 */
export function GrowBar({
  percent,
  className = '',
  color,
  delay = 0,
  duration = 0.9,
}: {
  percent: number;
  className?: string;
  color?: string;
  delay?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // 폭이 0인 막대는 관찰이 안 되므로 트랙 전체를 덮는 투명한 칸을 관찰한다
  const inView = useInView(ref, { once: true, amount: 0.6 });
  return (
    <>
      <span ref={ref} className="pointer-events-none absolute inset-0" aria-hidden />
      <motion.span
        className={`absolute inset-y-0 left-0 rounded-full ${className}`}
        style={color ? { background: color } : undefined}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: reduce || inView ? `${percent}%` : 0 }}
        transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </>
  );
}
