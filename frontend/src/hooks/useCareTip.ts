import { useEffect, useRef, useState } from 'react';
import { fetchCareTip } from '../api/careTip';
import { load, peek, put } from '../api/queryCache';
import { readJSON, writeJSON } from '../context/storage';
import { getSkinCareTip } from '../mocks/home';
import { SkinType, WeatherCondition } from '../types';

interface UseCareTipResult {
  /** 로딩 중엔 null. 로딩이 끝나면(성공이든 실패든) 항상 값이 채워진다 —
   *  실패 시 정적 폴백 문구로 채우기 때문. null이 "로딩 중"의 유일한 신호다. */
  tip: string | null;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
}

/**
 * 오늘의 케어 문구 조회 (AI 생성, 서버가 하루 단위로 캐싱).
 *
 * 초기값을 정적 문구가 아니라 null로 둔다 — 캐시 미스로 AI 생성이 1~2초
 * 걸릴 때, 그 시간 동안 정적 폴백 문구가 마치 실제 데이터인 것처럼 화면에
 * 떠 있는 걸 막기 위해서다(호출부가 null을 "로딩 중"으로 보고 스켈레톤을
 * 보여줘야 한다). 정적 테이블(getSkinCareTip)은 AI 생성이 실제로 실패했을
 * 때만 폴백으로 쓴다 — useWeather와 같은 방어적 설계.
 *
 * 피부타입을 모르면 묻지 않는다
 * -----------------------------
 * `fetchCareTip`은 skinType이 필수다. 예전에는 화면이 기본값 'ondalsam'을
 * 넘겨서 옹달샘용 문구를 한 번 받아 보여준 뒤 진단이 도착하면 다시 받았다.
 * `skinPending`이면 기다리고, 진단을 한 적이 없으면(`skinType === null`)
 * 진단을 권하는 문구를 낸다 — 남의 타입 문구를 보여주지 않는다.
 */
/**
 * 오늘의 문구는 **그날 한 번 정해지면 고정**한다.
 *
 * 서버가 피부타입·날짜 단위로 하루 한 번 생성한다. 앱에서는 메모리 캐시(탭 이동)와
 * localStorage(새로고침·재방문)에 그날 문구를 들고, 있으면 다시 묻지 않는다 —
 * 예전에는 한 시간이 지나거나 새로고침하면 다시 묻고, 실패한 요청은 캐시되지 않아
 * 탭을 오갈 때마다 스켈레톤이 뜨며 폴백 문구가 다시 만들어졌다.
 */
/** 날짜가 키에 들어 있어 하루 안에는 신선하다고 본다 */
const CARE_TIP_FRESH_MS = 24 * 60 * 60 * 1000;
const todayStamp = () => new Date().toDateString();
const careTipKey = (skinType: SkinType) => `caretip:${skinType}:${todayStamp()}`;
const storeKey = (skinType: SkinType) => `swappy:caretip:v1:${skinType}`;

interface StoredTip {
  date: string;
  tip: string;
}

/** 오늘 이미 정해진 문구(메모리 → localStorage 순). 없으면 undefined */
function todaysTip(skinType: SkinType): string | undefined {
  const mem = peek<{ tip: string }>(careTipKey(skinType))?.value.tip;
  if (mem !== undefined) return mem;
  const saved = readJSON<StoredTip | null>(storeKey(skinType), null);
  if (saved && saved.date === todayStamp() && saved.tip) {
    put(careTipKey(skinType), { tip: saved.tip });
    return saved.tip;
  }
  return undefined;
}

export function useCareTip(
  skinType: SkinType | null,
  skinPending: boolean,
  condition: WeatherCondition,
): UseCareTipResult {
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 폴백 문구에만 쓰는 날씨. 날씨가 로드되며 바뀌어도 문구를 다시 만들지 않으려고 ref로 읽는다.
  const conditionRef = useRef(condition);
  useEffect(() => {
    conditionRef.current = condition;
  }, [condition]);

  useEffect(() => {
    if (skinPending || skinType === null) return;
    // 오늘 문구가 이미 정해져 있으면 다시 묻지 않는다(렌더는 아래 cached가 맡는다)
    if (todaysTip(skinType) !== undefined) return;

    let alive = true;

    load(careTipKey(skinType), () => fetchCareTip(skinType), CARE_TIP_FRESH_MS)
      .then((res) => {
        writeJSON(storeKey(skinType), { date: todayStamp(), tip: res.tip } satisfies StoredTip);
        if (alive) setTip(res.tip);
      })
      .catch((err: unknown) => {
        // 실패했을 때만 정적 폴백. 오늘 안에는 이 문구로 고정해 다시 묻거나 바뀌지 않게 한다
        // (localStorage에는 넣지 않는다 — 다음에 열면 AI 문구를 다시 시도한다).
        const fallback = getSkinCareTip(skinType, conditionRef.current);
        put(careTipKey(skinType), { tip: fallback });
        if (!alive) return;
        setError(err instanceof Error ? err.message : '케어 문구를 불러오지 못했습니다.');
        setTip(fallback);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [skinType, skinPending]);

  // 진단 전에는 문구가 아니라 다음 할 일을 알린다. 이건 폴백이 아니라
  // 그 상태의 정답이다.
  if (!skinPending && skinType === null) {
    return {
      tip: '피부타입을 진단하면 오늘의 케어를 알려드려요.',
      loading: false,
      error: null,
    };
  }

  // 오늘 문구가 있으면 첫 렌더부터 쓴다(탭 이동·새로고침 깜빡임 제거).
  const cached = skinType ? todaysTip(skinType) : undefined;
  if (tip === null && cached !== undefined) return { tip: cached, loading: false, error: null };

  return { tip, loading: skinPending || loading, error };
}
