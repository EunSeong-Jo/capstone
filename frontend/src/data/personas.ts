/**
 * 데모/테스트용 사용자 페르소나.
 *
 * 원본은 `personas.json` 한 곳이며, 백엔드 `scripts/seed_test_users.py`가 같은 파일을
 * 읽어 DB(users/profiles/diagnoses)에 같은 사람을 심는다. 값 수정은 JSON에서만 한다.
 *
 * 인증 API가 아직 없어 로그인은 이 목록과의 이메일·비밀번호 대조로 처리한다(AuthContext).
 */
import raw from './personas.json';
import type { SkinType } from '../types';

/** 진단 5축 — 백엔드 diagnosis.py의 moisture/oil/sensitivity/pigmentation/trouble와 동일 */
export interface AxisScores {
  moisture: number;
  oil: number;
  sensitivity: number;
  pigmentation: number;
  trouble: number;
}

export interface DiagnosisRank {
  rank: number;
  skinType: SkinType;
  score: number;
}

export interface OwnedCosmetic {
  id: number;
  brand: string;
  name: string;
  category: string;
  price: number;
  keyIngredients: string[];
}

export interface Persona {
  id: string;
  email: string;
  password: string;
  nickname: string;
  /** 팀 구성 슬라이드와 동일한 역할 표기 ("팀장 · 프론트엔드 통합") */
  role: string;
  memberSince: string;
  skinType: SkinType;
  scores: AxisScores;
  ranks: DiagnosisRank[];
  budget: { min: number; max: number };
  ownedCosmetics: OwnedCosmetic[];
}

export const QUIZ_VERSION: string = raw.quizVersion;

export const PERSONAS: Persona[] = raw.personas as Persona[];

export function findPersonaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/** 로그인 대조 — 이메일은 대소문자 무시, 비밀번호는 정확히 일치 */
export function matchPersona(email: string, password: string): Persona | undefined {
  const e = email.trim().toLowerCase();
  return PERSONAS.find((p) => p.email.toLowerCase() === e && p.password === password);
}
