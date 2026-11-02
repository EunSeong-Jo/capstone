import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import type { StateRow } from './StateGroups';
import { bubbleRows } from './bubbleRows';
import type { AnatomyItem } from '../../api/analysis';
import { INNER_W_OF, bottleKind } from './bottleShape';
import { helperNames } from './helperNames';

/**
 * "이 제품이 내가 신경 쓰는 부분을 얼마나 돕는지"를 병 안에 쌓이는 원으로 보여 준다(수박 게임처럼).
 * 항목 하나가 원 하나이고, 원의 **면적이 도움 정도(0~100)에 비례**한다. 원은 위에서 하나씩 떨어져 서로 부딪히며 빈틈을 메우고 자리를 잡는다.
 *
 * 물리 엔진 라이브러리 없이 작은 베를레(Verlet) 시뮬레이션을 직접 돌린다: 중력 → 원끼리·벽·바닥 겹침 풀기.
 * 시작 위치와 떨어지는 순서가 계산으로 정해지고 시간 간격이 고정이라 **같은 제품은 늘 같은 모양으로 쌓인다**(시연을 여러 번 찍어도 같다).
 */
const R_MIN = 19; // 이름과 숫자가 둘 다 들어가는 최소 크기
const R_MAX = 38;
const BASE_INNER_W = 132; // 원 최대 크기(R_MAX)의 기준이 되는 병 안쪽 폭(토너 병)
const GRAVITY = 0.42;
const DAMPING = 0.992;
const SOLVER_PASSES = 6;
const RELEASE_EVERY = 14; // 이 프레임마다 원 하나를 떨어뜨린다
const MAX_STEPS = 900;
const WALL = 2; // 벽·바닥과 원 사이 여유(원 테두리가 잘리지 않게)

const STATUS_TEXT = { good: '도와줘요', some: '도움이 부족해요', lack: '도움이 많이 부족해요' } as const;

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

/** 원 넓이 합으로 잡은 첫 추정 높이(빈틈을 감안해 넉넉히). `fitHeight`가 실제로 쌓아 본 뒤 줄인다. */
function guessHeight(items: Item[], innerW: number) {
  const area = items.reduce((s, i) => s + Math.PI * i.r * i.r, 0);
  return Math.ceil(area / 0.72 / innerW) + 20;
}

/** 떨어뜨릴 시작 가로 위치: 순서마다 병 폭 안에서 고르게 흩뜨린다(난수 없이 고정). */
function startX(i: number, r: number, innerW: number) {
  const f = (i * 0.618033988749895) % 1;
  return r + WALL + f * (innerW - 2 * (r + WALL));
}

function createBodies(items: Item[], innerW: number): Body[] {
  return items.map((it, i) => {
    const x = startX(i, it.r, innerW);
    const y = -it.r - 6;
    return { ...it, x, y, px: x, py: y, released: false };
  });
}

/** 한 프레임. 움직임이 거의 없고 모두 떨어졌으면 true(멈춤). */
function step(bodies: Body[], h: number, frame: number, innerW: number): boolean {
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
      if (b.x > innerW - b.r - WALL) b.x = innerW - b.r - WALL;
      if (b.y > h - b.r - WALL) {
        b.y = h - b.r - WALL;
        b.px = b.px * 0.4 + b.x * 0.6; // 바닥 마찰: 옆으로 미끄러지는 속도를 줄인다
      }
    }
  }
  for (const b of bodies) if (b.released) moved = Math.max(moved, Math.abs(b.x - b.px) + Math.abs(b.y - b.py - GRAVITY));
  return bodies.every((b) => b.released) && moved < 0.03;
}

/** 높이 `h`인 병에서 끝까지 쌓았을 때 가장 높은 원의 윗면 위치(병 천장 기준 y). 작을수록 병이 꽉 찼다 */
function settledTop(items: Item[], innerW: number, h: number): number {
  const bodies = createBodies(items, innerW);
  let frame = 0;
  let done = false;
  while (!done && frame < MAX_STEPS) done = step(bodies, h, frame++, innerW);
  return Math.min(...bodies.map((b) => b.y - b.r));
}

/**
 * 병 안쪽 높이를 실제로 쌓아 본 결과에 맞춘다. 같은 입력이면 시뮬레이션이 늘 같은 결과라, 화면에서 원이 떨어질 때의 최종 모양과 정확히 같다.
 * 가장 높은 원 위에 `PAD`만큼만 여유를 두고, 몇 번 되풀이해 바닥(h)이 바뀌어도 어긋나지 않게 맞춘다.
 */
const PAD = 10;
function fitHeight(items: Item[], innerW: number): number {
  if (items.length === 0) return 90;
  const maxR = Math.max(...items.map((i) => i.r));
  const floorMin = Math.ceil(maxR * 2 + PAD * 2);
  let h = guessHeight(items, innerW);
  for (let n = 0; n < 5; n++) {
    const top = settledTop(items, innerW, h);
    const need = Math.max(floorMin, Math.ceil(h - top + PAD));
    if (Math.abs(need - h) <= 1) return need;
    h = need;
  }
  // 수렴하지 않으면 마지막 모양에서 원이 천장에 닿지 않게 넉넉히
  const top = settledTop(items, innerW, h);
  return top < 4 ? h + Math.ceil(4 - top) + 2 : h;
}

/** 원을 눌렀을 때의 한 줄 설명. 자세히 보기와 같은 계산(`helperNames`)으로 세어 두 곳의 숫자가 같다 */
function explain(row: StateRow, anatomy: AnatomyItem[]): string {
  const need = row.need.join('·') || '관련';
  const n = helperNames(row.need, anatomy).length;
  if (row.status === 'good') return `${need} 관련 성분 ${n}종이 도와줘요`;
  return n > 0 ? `${need} 관련 성분이 ${n}종 있지만 부족해요` : `${need} 관련 성분이 이 제품에는 거의 없어요`;
}

export function ProductBubbles({
  rows,
  action,
  product,
  anatomy = [],
}: {
  rows: StateRow[];
  /** 제목 오른쪽에 둘 버튼(자세히 보기 등) */
  action?: ReactNode;
  /** 병 모양과 라벨에 쓰는 제품 정보 */
  product?: { name: string; brand: string };
  /** 원을 눌렀을 때 "도와주는 성분 N종"을 자세히 보기와 같은 계산으로 세는 데 쓴다 */
  anatomy?: AnatomyItem[];
}) {
  const reduce = useReducedMotion();
  const helped = bubbleRows(rows);
  const kind = bottleKind(product?.name ?? '');
  const innerW = INNER_W_OF[kind];
  // 병이 좁을수록(앰플·튜브) 원도 작게 한다. 글자가 들어갈 최소 크기는 지킨다.
  const scale = Math.min(1, innerW / BASE_INNER_W);
  const rMax = Math.max(R_MIN + 8, R_MAX * scale);
  const rMin = scale < 1 ? 17 : R_MIN;
  const items: Item[] = helped
    .map((r) => ({
      key: r.key,
      name: r.name,
      value: Math.round(r.coverage),
      status: r.status as 'good' | 'some' | 'lack',
      // 원 면적이 도움 점수에 비례하도록 반지름은 제곱근으로 잡는다(너무 작아 글자가 안 들어가지 않게 바닥값 R_MIN)
      r: Math.max(rMin, rMax * Math.sqrt(Math.max(0, Math.min(100, r.coverage)) / 100)),
    }))
    .sort((a, b) => b.r - a.r);
  // 같은 데이터면 시뮬레이션을 다시 돌리지 않는다(화면이 다시 그려져도 원이 다시 떨어지지 않게)
  const sig = items.map((i) => `${i.key}:${i.value}:${i.status}`).join('|');
  // 같은 데이터면 다시 재지 않는다(그림이 다시 그려질 때마다 시뮬레이션을 돌리지 않게)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const h = useMemo(() => fitHeight(items, innerW), [sig, innerW]);
  const [pos, setPos] = useState<{ x: number; y: number; on: boolean }[]>([]);
  const raf = useRef(0);
  // 눌러서 고른 원(항목 key). 같은 원을 다시 누르면 해제
  const [selected, setSelected] = useState<string | null>(null);
  const selectedItem = items.find((i) => i.key === selected) ?? null;
  const selectedRow = selectedItem ? helped.find((r) => r.key === selectedItem.key) ?? null : null;
  const cardRef = useRef<HTMLDivElement>(null);
  // 병이 화면에 보이기 시작할 때 원이 떨어진다(스크롤로 내려오기 전에 다 쌓여 있지 않게)
  const inView = useInView(cardRef, { once: true, amount: 0.4 });

  useEffect(() => {
    if (items.length === 0 || !inView) return;
    const bodies = createBodies(items, innerW);
    const snapshot = () => setPos(bodies.map((b) => ({ x: b.x, y: b.y, on: b.released })));
    let frame = 0;
    let done = false;
    if (reduce) {
      while (!done && frame < MAX_STEPS) done = step(bodies, h, frame++, innerW);
      snapshot();
      return;
    }
    const tick = () => {
      // 프레임 속도와 상관없이 같은 결과가 되도록 한 번에 고정 간격 한 걸음씩만 간다
      done = step(bodies, h, frame++, innerW);
      snapshot();
      if (!done && frame < MAX_STEPS) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, reduce, inView, innerW]);


  const neckH = 18;
  const W = 200;
  const bodyX = (W - innerW) / 2 - 8;
  const bodyW = innerW + 16;
  const bodyH = h + 20;
  const bodyTop = neckH + 10;
  const H = bodyTop + bodyH + 8;
  const innerTop = bodyTop + 10; // 몸통 안쪽 천장
  const clipId = useId().replace(/:/g, '') + '-clip';

  return (
    <div ref={cardRef} className="rounded-xl bg-white px-3.5 pt-3 pb-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] font-extrabold text-oy-text">이 제품은 이런 걸 잘 도와요</p>
        {action}
      </div>
      {/* 설명은 링크 옆 좁은 칸이 아니라 한 줄 전체 폭을 쓴다(링크가 있어도 두 줄로 내려가지 않게) */}
      <p className="mt-0.5 text-[11px] text-oy-sub">원이 클수록 내가 신경 쓰는 부분을 더 잘 도와요</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="신경 쓰는 항목별 제품의 도움 정도" className="mx-auto mt-2 block w-full max-w-[300px]">
        <defs>
          <clipPath id={clipId}>
            <rect x={bodyX + 8} y={bodyTop} width={innerW} height={bodyH - 2} rx={14} />
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
              <g
                key={it.key}
                role="button"
                tabIndex={0}
                aria-pressed={selected === it.key}
                aria-label={`${it.name} ${it.value}점`}
                style={{ cursor: 'pointer', outline: 'none' }}
                onClick={() => setSelected(selected === it.key ? null : it.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(selected === it.key ? null : it.key);
                  }
                }}
              >
                {selected === it.key && <circle cx={cx} cy={cy} r={it.r + 4} fill="none" stroke={t.stroke} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />}
                <circle cx={cx} cy={cy} r={it.r} fill={t.fill} stroke={t.stroke} strokeWidth={selected === it.key ? 3 : 1.6} />
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
        <>
          {/* 한 줄 요약: 색 범례를 대신한다(잘 돕는 항목은 초록, 부족한 항목은 빨강) */}
          <p className="mt-1 text-center text-[12px] font-semibold text-oy-text">
            잘 돕는 항목 <span className="font-extrabold text-good">{items.filter((i) => i.status === 'good').length}</span>
            <span className="mx-1.5 text-oy-sub">·</span>
            부족한 항목 <span className="font-extrabold text-danger">{items.filter((i) => i.status !== 'good').length}</span>
          </p>
          {selectedRow && selectedItem ? (
            <div role="status" className="mt-2 rounded-xl px-3 py-2.5" style={{ background: TONE[selectedItem.status].fill }}>
              <p className="flex items-center gap-2 text-[13px] font-extrabold" style={{ color: TONE[selectedItem.status].text }}>
                {selectedRow.name}
                <span className="text-[12px]">{selectedItem.value}점</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">{STATUS_TEXT[selectedItem.status]}</span>
              </p>
              <p className="mt-1 text-[12px] leading-snug text-oy-text">{explain(selectedRow, anatomy)}</p>
            </div>
          ) : (
            <p className="mt-0.5 text-center text-[11px] text-oy-sub">원을 누르면 항목 설명이 나와요</p>
          )}
        </>
      )}
    </div>
  );
}
