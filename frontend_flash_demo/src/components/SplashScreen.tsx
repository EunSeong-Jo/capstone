import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'

import mulgae from '../assets/characters/mulgae.png'
import ongdalsaem from '../assets/characters/ongdalsaem.png'
import subuji from '../assets/characters/subuji.png'
import injeolmi from '../assets/characters/injeolmi.png'
import memilmuk from '../assets/characters/memilmuk.png'
import samak from '../assets/characters/samak.png'
import yuriguseul from '../assets/characters/yuriguseul.png'
import hwasan from '../assets/characters/hwasan.png'

type MotionGroup = 'squish' | 'pop'

interface CharacterConfig {
  id: string
  src: string
  alt: string
  group: MotionGroup
  startAngleDeg: number
  radiusXJitter: number
  radiusYJitter: number
}

// 8 캐릭터가 텍스트를 중심으로 한 타원 궤도를 따라 같은 속도로 공전한다.
// 45도씩 균일한 간격을 유지하되, 캐릭터마다 궤도 반지름에 약간의 편차를 줘서
// 자유로운 느낌을 낸다. 크기는 그룹별로 다르게(GROUP_SIZE_SCALE) 적용된다.
const CHARACTERS: CharacterConfig[] = [
  { id: 'mulgae', src: mulgae, alt: '반질반질물개 타입', group: 'squish', startAngleDeg: 270, radiusXJitter: -1.3, radiusYJitter: 0.7 },
  { id: 'memilmuk', src: memilmuk, alt: '얼룩덜룩메밀묵 타입', group: 'pop', startAngleDeg: 315, radiusXJitter: 1.3, radiusYJitter: -1 },
  { id: 'ongdalsaem', src: ongdalsaem, alt: '수분팡팡옹달샘 타입', group: 'squish', startAngleDeg: 0, radiusXJitter: 0, radiusYJitter: 1 },
  { id: 'samak', src: samak, alt: '바스락사막 타입', group: 'pop', startAngleDeg: 45, radiusXJitter: -1.7, radiusYJitter: -0.7 },
  { id: 'subuji', src: subuji, alt: '겉바속촉수부지 타입', group: 'squish', startAngleDeg: 90, radiusXJitter: 1, radiusYJitter: 0.3 },
  { id: 'yuriguseul', src: yuriguseul, alt: '조심조심유리구슬 타입', group: 'pop', startAngleDeg: 135, radiusXJitter: -1, radiusYJitter: 1 },
  { id: 'injeolmi', src: injeolmi, alt: '말랑말랑인절미 타입', group: 'squish', startAngleDeg: 180, radiusXJitter: 1.7, radiusYJitter: -1 },
  { id: 'hwasan', src: hwasan, alt: '울긋불긋화산 타입', group: 'pop', startAngleDeg: 225, radiusXJitter: 0, radiusYJitter: 0.7 },
]

// cqmin: 브라우저 창 크기가 아니라 .device-frame(모바일 프레임) 자체의
// 짧은 변을 기준으로 하는 컨테이너 쿼리 단위. 프레임이 데스크톱에서는
// 고정 크기(393x852)로, 실제 앱 빌드 시에는 화면 전체 크기로 렌더링되므로
// vmin 대신 이 단위를 써야 두 경우 모두 정확한 비율로 배치된다.
const BASE_RADIUS_X_CQMIN = 33
const BASE_RADIUS_Y_CQMIN = 15
const ORBIT_DURATION_S = 22
const ORBIT_STEPS = 24
const EXPOSURE_MS = 2800

// 사용자 피드백: 물개/옹달샘(물방울)/수부지/인절미(쫀득 그룹)가 화산/메밀묵/
// 사막/유리구슬(톡톡 그룹)보다 눈에 띄게 작아 보여서, 쫀득 그룹은 키우고
// 톡톡 그룹은 줄여서 체감 크기를 맞춘다.
const GROUP_SIZE_SCALE: Record<MotionGroup, number> = {
  squish: 2.0,
  pop: 0.74,
}

function charWidth(group: MotionGroup) {
  const scale = GROUP_SIZE_SCALE[group]
  return `clamp(${(48 * scale).toFixed(0)}px, ${(10 * scale).toFixed(2)}cqmin, ${(84 * scale).toFixed(0)}px)`
}

function useOrbitPath(config: CharacterConfig) {
  return useMemo(() => {
    const radiusX = BASE_RADIUS_X_CQMIN + config.radiusXJitter
    const radiusY = BASE_RADIUS_Y_CQMIN + config.radiusYJitter
    const left: string[] = []
    const top: string[] = []
    for (let i = 0; i <= ORBIT_STEPS; i++) {
      const angle = config.startAngleDeg + (360 * i) / ORBIT_STEPS
      const rad = (angle * Math.PI) / 180
      const x = radiusX * Math.cos(rad)
      const y = radiusY * Math.sin(rad)
      left.push(`calc(50% + ${x.toFixed(2)}cqmin)`)
      top.push(`calc(50% + ${y.toFixed(2)}cqmin)`)
    }
    return { left, top }
  }, [config])
}

function Character({ config, index }: { config: CharacterConfig; index: number }) {
  const { left, top } = useOrbitPath(config)
  const isSquish = config.group === 'squish'

  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      animate={{ left, top }}
      transition={{
        duration: ORBIT_DURATION_S,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      <motion.img
        src={config.src}
        alt={config.alt}
        className="select-none"
        style={{ width: charWidth(config.group) }}
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
            : {
                opacity: 1,
                y: [0, -7, 0, -3, 0],
                scale: [1, 1.05, 1, 0.97, 1],
              }
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
  )
}

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, EXPOSURE_MS)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-swappy-beige"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="relative h-full w-full">
        {CHARACTERS.map((config, index) => (
          <Character key={config.id} config={config} index={index} />
        ))}

        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
          style={{ fontFamily: 'var(--font-doodle)' }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: 'backOut' }}
        >
          <span className="text-[clamp(2.5rem,11cqmin,5rem)] text-swappy-pink">S</span>
          <span className="text-[clamp(2.5rem,11cqmin,5rem)] text-swappy-green">wappy</span>
        </motion.div>
      </div>
    </motion.div>
  )
}
