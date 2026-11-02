import { useEffect, useRef } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

/**
 * 0에서 `value`까지 올라가는 숫자. **화면에 보이기 시작할 때** 한 번 재생하고, `delay`(초)만큼 기다렸다 시작한다.
 * "동작 줄이기" 설정이면 처음부터 최종 값을 보여 준다. 값이 바뀌면 그 값으로 다시 올라간다(현재 값에서 이어서).
 */
export function CountUp({ value, delay = 0, duration = 0.9 }: { value: number; delay?: number; duration?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const mv = useMotionValue(reduce ? value : 0);
  const shown = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    if (!inView) return;
    const c = animate(mv, value, { duration, delay, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, delay, duration, reduce, mv, inView]);
  return <motion.span ref={ref}>{shown}</motion.span>;
}
