/**
 * 피부타입 진단 스코어링 (Task 13 경량 버전).
 *
 * QnA 6문항(components/onboarding/QuestionScreen.tsx)의 보기별 선택을 5축 점수로
 * 환산하고, 8개 피부타입 프로필과의 거리로 1~3순위를 매긴다. 백엔드 진단 엔진이
 * 붙기 전까지 데모에서 "실제로 답에 따라 결과가 달라지는" 경험을 만들기 위한 것이다.
 *
 * 5축은 백엔드 diagnosis.py와 동일: moisture / oil / sensitivity / pigmentation / trouble.
 */
import type { SkinType } from '../types';
import type { AxisScores, DiagnosisRank } from './personas';

type AxisKey = keyof AxisScores;
const AXES: AxisKey[] = ['moisture', 'oil', 'sensitivity', 'pigmentation', 'trouble'];

/** 문항 순서는 QuestionScreen.tsx의 QUESTIONS와 1:1 대응 */
const DELTAS: Partial<Record<AxisKey, number>>[][] = [
  // Q1 — 아침 물세수 1시간 후
  [
    { moisture: -3, oil: -2 }, // 전체 당김·푸석
    { moisture: -2, oil: 2 }, // T존 번들 / 볼 당김
    { oil: 3 }, // 전체 기름
    { moisture: 2, oil: 0 }, // 당김도 기름도 없음
  ],
  // Q2 — 자극 반응
  [
    { sensitivity: 3 }, // 쉽게 붉어지고 따가움
    { sensitivity: 2, trouble: 1 }, // 컨디션 나쁘면 간지럼·뾰루지
    { sensitivity: 1, moisture: -1 }, // 환절기만 각질
    { sensitivity: -2 }, // 늘 평온
  ],
  // Q3 — 여드름·홍조·염증 빈도
  [
    { trouble: 3, sensitivity: 1 }, // 365일 큰 뾰루지·홍조
    { trouble: 2, oil: 2 }, // 유분 많아 좁쌀·블랙헤드
    { trouble: 1 }, // 생리 전·컨디션
    { trouble: -2 }, // 거의 없음
  ],
  // Q4 — 가장 해결하고 싶은 고민
  [
    { pigmentation: 3 }, // 기미·잡티·흔적
    { oil: -1, trouble: -1 }, // 잔주름·탄력 (건성·안정 경향)
    { moisture: -2 }, // 각질·거친 결
    { sensitivity: -1, trouble: -1 }, // 현재 상태 유지
  ],
  // Q5 — 메이크업 무너짐
  [
    { oil: 3 }, // 전체 번들
    { oil: 2, moisture: -2 }, // 겉번들 속당김
    { oil: 1 }, // 코 주변만
    { oil: 2, moisture: 1 }, // 유분 때문에 유지됨
  ],
  // Q6 — 스킨케어 선택 포인트
  [
    { oil: 1 }, // 가벼운 에센스
    { moisture: -2 }, // 튼튼한 크림 (보습 갈망)
    { sensitivity: 2 }, // 순한 화장품
    { pigmentation: 1 }, // 고기능성 앰플
  ],
];

/** 8타입 프로필 (5축, 0~10 스케일) */
const PROFILES: Record<SkinType, AxisScores> = {
  ondalsam:   { moisture: 7, oil: 5, sensitivity: 3, pigmentation: 3, trouble: 2 },
  mulgae:     { moisture: 5, oil: 9, sensitivity: 4, pigmentation: 4, trouble: 5 },
  subuji:     { moisture: 3, oil: 7, sensitivity: 5, pigmentation: 4, trouble: 4 },
  hwasan:     { moisture: 4, oil: 7, sensitivity: 6, pigmentation: 5, trouble: 9 },
  samak:      { moisture: 1, oil: 2, sensitivity: 6, pigmentation: 4, trouble: 2 },
  injeolmi:   { moisture: 4, oil: 4, sensitivity: 3, pigmentation: 4, trouble: 2 },
  yuriguseul: { moisture: 4, oil: 4, sensitivity: 9, pigmentation: 3, trouble: 4 },
  memilmuk:   { moisture: 4, oil: 5, sensitivity: 4, pigmentation: 9, trouble: 3 },
};

const clamp = (n: number) => Math.max(0, Math.min(10, n));

export interface DiagnosisComputed {
  skinType: SkinType;
  scores: AxisScores;
  ranks: DiagnosisRank[];
}

/**
 * 선택 인덱스 배열(문항당 0~3, 미응답은 null)을 받아 5축 점수와 순위를 계산한다.
 */
export function computeDiagnosis(answers: (number | null)[]): DiagnosisComputed {
  const scores: AxisScores = { moisture: 5, oil: 5, sensitivity: 5, pigmentation: 5, trouble: 5 };

  answers.forEach((opt, qIndex) => {
    if (opt == null) return;
    const delta = DELTAS[qIndex]?.[opt];
    if (!delta) return;
    for (const axis of AXES) {
      if (delta[axis]) scores[axis] += delta[axis] as number;
    }
  });
  for (const axis of AXES) scores[axis] = clamp(scores[axis]);

  // 각 타입 프로필과의 유클리드 거리 → 근사도(1/(1+d))
  const affinity = (Object.keys(PROFILES) as SkinType[]).map((type) => {
    const p = PROFILES[type];
    const d = Math.sqrt(AXES.reduce((sum, a) => sum + (scores[a] - p[a]) ** 2, 0));
    return { type, weight: 1 / (1 + d) };
  });
  affinity.sort((a, b) => b.weight - a.weight);

  const top = affinity.slice(0, 3);
  const sum = top.reduce((s, t) => s + t.weight, 0) || 1;
  const ranks: DiagnosisRank[] = top.map((t, i) => ({
    rank: i + 1,
    skinType: t.type,
    score: Math.round((t.weight / sum) * 100) / 100,
  }));

  return { skinType: ranks[0].skinType, scores, ranks };
}
