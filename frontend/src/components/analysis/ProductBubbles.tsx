import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { StateRow } from './StateGroups';
import { bubbleRows } from './bubbleRows';

/**
 * "이 제품이 내가 신경 쓰는 부분을 얼마나 돕는지"를 병 안에 쌓이는 원으로 보여 준다(수박 게임처럼).
 * 항목 하나가 원 하나이고, 원의 **면적이 도움 정도(0~100)에 비례**한다. 원은 위에서 하나씩 떨어져 서로 부딪히며 빈틈을 메우고 자리를 잡는다.
 *
 * 물리 엔진 라이브러리 없이 작은 베를레(Verlet) 시뮬레이션을 직접 돌린다: 중력 → 원끼리·벽·바닥 겹침 풀기.
 * 시작 위치와 떨어지는 순서가 계산으로 정해지고 시간 간격이 고정이라 **같은 제품은 늘 같은 모양으로 쌓인다**(시연을 여러 번 찍어도 같다).
 */
const R_MIN = 19; // 이름과 숫자가 둘 다 들어가는 최소 크기
const R_MAX = 38;
const INNER_W = 136; // 병 몸통 안쪽 폭
const GRAVITY = 0.42;
const DAMPING = 0.992;
const SOLVER_PASSES = 6;
const RELEASE_EVERY = 14; // 이 프레임마다 원 하나를 떨어뜨린다
const MAX_STEPS = 900;
const WALL = 2; // 벽·바닥과 원 사이 여유(원 테두리가 잘리지 않게)

const TONE = {
  good: { fill: '#EAF5EF', stroke: '#2B6B52', text: '#2B6B52' },
  some: { fill: '#FFF4D6', stroke: '#B26B00', text: '#8A5A00' },
  lack: { fill: '#FDECEC', stroke: '#C0392B', text: '#C0392B' },
} as const;

interface Item {
  key: string;
  name: string;
  value: number;
  status: 'good' | 'some' | 'lack';
  r: number;
}
interface Body extends Item {
  x: number;
  y: number;
  px: number;
  py: number;
  released: boolean;
}

/** 원 넓이 합으로 병 안쪽 높이를 정한다(빈틈을 감안해 넉넉히). */
function innerHeight(items: Item[]) {
  const area = items.reduce((s, i) => s + Math.PI * i.r * i.r, 0);
  return Math.max(150, Math.ceil(area / 0.72 / INNER_W) + 20);
}

/** 떨어뜨릴 시작 가로 위치: 순서마다 병 폭 안에서 고르게 흩뜨린다(난수 없이 고정). */
function startX(i: number, r: number) {
  const f = (i * 0.618033988749895) % 1;
  return r + WALL + f * (INNER_W - 2 * (r + WALL));
}

function createBodies(items: Item[]): Body[] {
  return items.map((it, i) => {
    const x = startX(i, it.r);
    const y = -it.r - 6;
    return { ...it, x, y, px: x, py: y, released: false };
  });
}

/** 한 프레임. 움직임이 거의 없고 모두 떨어졌으면 true(멈춤). */
function step(bodies: Body[], h: number, frame: number): boolean {
  const idx = Math.floor(frame / RELEASE_EVERY);
  bodies.forEach((b, i) => {
    if (!b.released && i <= idx && frame % RELEASE_EVERY === 0) b.released = true;
  });
  let moved = 0;
  for (const b of bodies) {
    if (!b.released) continue;
    const vx = (b.x - b.px) * DAMPING;
    const vy = (b.y - b.py) * DAMPING;
    b.px = b.x;
    b.py = b.y;
    b.x += vx;
    b.y += vy + GRAVITY;
  }
  for (let pass = 0; pass < SOLVER_PASSES; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a.released) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const c = bodies[j];
        if (!c.released) continue;
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const min = a.r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const push = (min - d) / d;
        const ma = a.r * a.r;
        const mc = c.r * c.r;
        const wa = mc / (ma + mc);
        const wc = ma / (ma + mc);
        a.x -= dx * push * wa;
        a.y -= dy * push * wa;
        c.x += dx * push * wc;
        c.y += dy * push * wc;
      }
    }
    for (const b of bodies) {
      if (!b.released) continue;
      if (b.x < b.r + WALL) b.x = b.r + WALL;
      if (b.x > INNER_W - b.r - WALL) b.x = INNER_W - b.r - WALL;
      if (b.y > h - b.r - WALL) {
        b.y = h - b.r - WALL;
        b.px = b.px * 0.4 + b.x * 0.6; // 바닥 마찰: 옆으로 미끄러지는 속도를 줄인다
      }
    }
  }
  for (const b of bodies) if (b.released) moved = Math.max(moved, Math.abs(b.x - b.px) + Math.abs(b.y - b.py - GRAVITY));
  return bodies.every((b) => b.released) && moved < 0.03;
}

export function ProductBubbles({ rows, action }: { rows: StateRow[]; /** 제목 오른쪽에 둘 버튼(자세히 보기 등) */ action?: ReactNode }) {
  const reduce = useReducedMotion();
  const helped = bubbleRows(rows);
  const items: Item[] = helped
    .map((r) => ({
      key: r.key,
      name: r.name,
      value: Math.round(r.coverage),
      status: r.status as 'good' | 'some' | 'lack',
      // 원 면적이 도움 점수에 비례하도록 반지름은 제곱근으로 잡는다(너무 작아 글자가 안 들어가지 않게 바닥값 R_MIN)
      r: Math.max(R_MIN, R_MAX * Math.sqrt(Math.max(0, Math.min(100, r.coverage)) / 100)),
    }))
    .sort((a, b) => b.r - a.r);
  // 같은 데이터면 시뮬레이션을 다시 돌리지 않는다(화면이 다시 그려져도 원이 다시 떨어지지 않게)
  const sig = items.map((i) => `${i.key}:${i.value}:${i.status}`).join('|');
  const h = innerHeight(items);
  const [pos, setPos] = useState<{ x: number; y: number; on: boolean }[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    if (items.length === 0) return;
    const bodies = createBodies(items);
    const snapshot = () => setPos(bodies.map((b) => ({ x: b.x, y: b.y, on: b.released })));
    let frame = 0;
    let done = false;
    if (reduce) {
      while (!done && frame < MAX_STEPS) done = step(bodies, h, frame++);
      snapshot();
      return;
    }
    const tick = () => {
      // 프레임 속도와 상관없이 같은 결과가 되도록 한 번에 고정 간격 한 걸음씩만 간다
      done = step(bodies, h, frame++);
      snapshot();
      if (!done && frame < MAX_STEPS) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, reduce]);


  const neckH = 18;
  const W = 200;
  const bodyX = (W - INNER_W) / 2 - 8;
  const bodyW = INNER_W + 16;
  const bodyH = h + 20;
  const bodyTop = neckH + 10;
  const H = bodyTop + bodyH + 8;
  const innerTop = bodyTop + 10; // 몸통 안쪽 천장
  const clipId = 'bottle-clip';

  return (
    <div className="rounded-xl bg-white px-3.5 pt-3 pb-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-oy-text">이 제품은 이런 걸 잘 도와요</p>
          <p className="mt-0.5 text-[11px] text-oy-sub">원이 클수록 내가 신경 쓰는 부분을 더 잘 도와요</p>
        </div>
        {action}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="신경 쓰는 항목별 제품의 도움 정도" className="mx-auto mt-2 block w-full max-w-[300px]">
        <defs>
          <clipPath id={clipId}>
            <rect x={bodyX + 8} y={bodyTop} width={INNER_W} height={bodyH - 2} rx={14} />
          </clipPath>
        </defs>
        {/* 병: 뚜껑·목·몸통 */}
        <rect x={W / 2 - 22} y={0} width={44} height={10} rx={3} fill="#C9D3CC" />
        <rect x={W / 2 - 16} y={10} width={32} height={neckH} fill="#EEF2EF" stroke="#C9D3CC" strokeWidth={2} />
        <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} rx={22} fill="#F6F9F7" stroke="#C9D3CC" strokeWidth={2.5} />
        <g clipPath={`url(#${clipId})`}>
          {items.map((it, i) => {
            const p = pos[i];
            if (!p || !p.on) return null;
            const t = TONE[it.status];
            const cx = bodyX + 8 + p.x;
            const cy = innerTop + p.y;
            // 이름은 원 안에 들어가게 글자 수에 맞춰 줄이고, 숫자는 모든 원에 적는다
            const nameSize = Math.min(10, (it.r * 2 * 0.84) / Math.max(2, it.name.length));
            return (
              <g key={it.key}>
                <circle cx={cx} cy={cy} r={it.r} fill={t.fill} stroke={t.stroke} strokeWidth={1.6} />
                <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle" fontSize={nameSize} fontWeight={700} fill={t.text}>
                  {it.name}
                </text>
                <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle" fontSize={it.r >= 26 ? 11 : 9.5} fontWeight={800} fill={t.text}>
                  {it.value}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {items.length === 0 ? (
        <p className="mt-1 text-center text-[11px] text-oy-sub">지금은 신경 쓸 부분이 없어서 병이 비어 있어요</p>
      ) : (
      <p className="mt-1 text-center text-[11px] text-oy-sub">
        <span className="font-bold text-good">초록</span> 도와줘요 · <span className="font-bold text-caution">노랑</span> 부족해요 ·{' '}
        <span className="font-bold text-danger">빨강</span> 많이 부족
      </p>
      )}
    </div>
  );
}
