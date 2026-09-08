import { useMemo } from 'react';
import { motion } from 'framer-motion';

import mulgae from '../../assets/characters/mulgae.png';
import ongdalsaem from '../../assets/characters/ongdalsaem.png';
import subuji from '../../assets/characters/subuji.png';
import injeolmi from '../../assets/characters/injeolmi.png';
import memilmuk from '../../assets/characters/memilmuk.png';
import samak from '../../assets/characters/samak.png';
import yuriguseul from '../../assets/characters/yuriguseul.png';
import hwasan from '../../assets/characters/hwasan.png';

type MotionGroup = 'squish' | 'pop';

interface CharacterConfig {
  id: string;
  src: string;
  alt: string;
  group: MotionGroup;
  startAngleDeg: number;
}

// 8 캐릭터가 워드마크를 중심으로 한 타원 궤도를 정확히 45°씩 균일 간격으로 공전한다.
// group은 제자리 모션 텍스처(쫀득 vs 톡톡)만 구분한다.
const CHARACTERS: CharacterConfig[] = [
  { id: 'mulgae', src: mulgae, alt: '반질반질물개 타입', group: 'squish', startAngleDeg: 270 },
  { id: 'memilmuk', src: memilmuk, alt: '얼룩덜룩메밀묵 타입', group: 'pop', startAngleDeg: 315 },
  { id: 'ondalsam', src: ongdalsaem, alt: '수분팡팡옹달샘 타입', group: 'squish', startAngleDeg: 0 },
  { id: 'samak', src: samak, alt: '바스락사막 타입', group: 'pop', startAngleDeg: 45 },
  { id: 'subuji', src: subuji, alt: '겉바속촉수부지 타입', group: 'squish', startAngleDeg: 90 },
  { id: 'yuriguseul', src: yuriguseul, alt: '조심조심유리구슬 타입', group: 'pop', startAngleDeg: 135 },
  { id: 'injeolmi', src: injeolmi, alt: '말랑말랑인절미 타입', group: 'squish', startAngleDeg: 180 },
  { id: 'hwasan', src: hwasan, alt: '울긋불긋화산 타입', group: 'pop', startAngleDeg: 225 },
];

// cqmin: 부모 래퍼(pages/Splash/index.tsx)의 container-type:size 기준 짧은 변.
// 워드마크(≈가로 16cqmin·세로 6cqmin 반경)를 감싸는 타원. 쫀득 그룹(반경 ≈11cqmin)이
// 어느 각도에서도 텍스트를 가리지 않도록 rx/ry를 그보다 크게 잡되 최대한 좁게 둔다.
const BASE_RADIUS_X_CQMIN = 33;
const BASE_RADIUS_Y_CQMIN = 20;
const ORBIT_DURATION_S = 22;
const ORBIT_STEPS = 24;

// 캐릭터 크기는 데모에서 쓰던 그룹별 스케일을 그대로 사용한다.
// (쫀득 그룹이 톡톡 그룹보다 작아 보이는 문제를 크기로 보정)
const GROUP_SIZE_SCALE: Record<MotionGroup, number> = { squish: 2.0, pop: 0.74 };

function charSize(group: MotionGroup) {
  const s = GROUP_SIZE_SCALE[group];
  return `clamp(${(48 * s).toFixed(0)}px, ${(10 * s).toFixed(2)}cqmin, ${(84 * s).toFixed(0)}px)`;
}

function useOrbitPath(startAngleDeg: number, size: string) {
  return useMemo(() => {
    const left: string[] = [];
    const top: string[] = [];
    for (let i = 0; i <= ORBIT_STEPS; i++) {
      const rad = ((startAngleDeg + (360 * i) / ORBIT_STEPS) * Math.PI) / 180;
      const x = BASE_RADIUS_X_CQMIN * Math.cos(rad);
      const y = BASE_RADIUS_Y_CQMIN * Math.sin(rad);
      // 캐릭터 박스를 궤도 지점에 '중심 정렬'하기 위해 박스 절반만큼 당긴다.
      // framer-motion이 left/top을 애니메이트하므로 transform(translate) 대신
      // calc 오프셋으로 중앙을 맞춰야 Tailwind translate 유틸과 충돌하지 않는다.
      left.push(`calc(50% + ${x.toFixed(2)}cqmin - ${size} / 2)`);
      top.push(`calc(50% + ${y.toFixed(2)}cqmin - ${size} / 2)`);
    }
    return { left, top };
  }, [startAngleDeg, size]);
}

function Character({ config, index }: { config: CharacterConfig; index: number }) {
  const isSquish = config.group === 'squish';
  const size = charSize(config.group);
  const { left, top } = useOrbitPath(config.startAngleDeg, size);

  return (
    <motion.div
      className="absolute"
      style={{ width: size, height: size }}
      animate={{ left, top }}
      transition={{ duration: ORBIT_DURATION_S, repeat: Infinity, ease: 'linear' }}
    >
      <motion.img
        src={config.src}
        alt={config.alt}
        className="h-full w-full select-none object-contain"
        draggable={false}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={
          isSquish
            ? {
                opacity: 1,
                scaleX: [1, 1.05, 0.95, 1.02, 1],
                scaleY: [1, 0.95, 1.05, 0.98, 1],
                rotate: [0, -2, 2, -1, 0],
              }
            : { opacity: 1, y: [0, -7, 0, -3, 0], scale: [1, 1.05, 1, 0.97, 1] }
        }
        transition={{
          opacity: { duration: 0.5, delay: 0.3 + index * 0.08 },
          default: {
            duration: isSquish ? 1.8 : 1.1,
            repeat: Infinity,
            ease: isSquish ? 'easeInOut' : 'easeOut',
            delay: 0.8 + index * 0.15,
          },
        }}
      />
    </motion.div>
  );
}

export default function SplashScreen() {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-ob-bg"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="relative h-full w-full">
        {CHARACTERS.map((config, index) => (
          <Character key={config.id} config={config} index={index} />
        ))}

        {/* 중앙 정렬은 정적 래퍼가 담당 (framer transform과 충돌 방지) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="whitespace-nowrap"
            style={{ fontFamily: "'Rubik Doodle Shadow', system-ui, sans-serif" }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: 'backOut' }}
          >
            <span className="text-[clamp(2.5rem,11cqmin,5rem)]" style={{ color: '#ef969f' }}>
              S
            </span>
            <span className="text-ob-green-deep text-[clamp(2.5rem,11cqmin,5rem)]">wappy</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
