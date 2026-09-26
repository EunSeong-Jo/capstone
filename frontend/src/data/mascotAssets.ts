import type { SkinType } from '../types';

/**
 * 피부타입별 마스코트 얼굴 에셋 (public/mascot/).
 * ProfileDashboard(홈)·마이·캐릭터 꾸미기 화면이 전부 이 맵 하나를 본다 —
 * 예전엔 ProfileDashboard 안에 로컬로만 있어서 마이 화면 프로필 사진이나
 * 꾸미기 화면 미리보기가 실제 진단 결과를 못 따라갔다.
 */
export const TYPE_FACE_SRC: Record<SkinType, string> = {
  ondalsam: '/mascot/수분팡팡옹달샙타입.png',
  mulgae: '/mascot/반질반질물개타입.png',
  subuji: '/mascot/겉바속촉수부지타입.png',
  hwasan: '/mascot/울긋불긋화산타입.png',
  samak: '/mascot/바스락사막타입.png',
  injeolmi: '/mascot/말랑말랑인절미타입.png',
  yuriguseul: '/mascot/조심조심유리구슬타입.png',
  memilmuk: '/mascot/얼룩덜룩메밀묵타입.png',
};

/**
 * 진단 전 캐릭터.
 *
 * `base_face_*.png`는 피부타입을 대표하지 않는 범용 얼굴이라 타입별 표시에는
 * 쓰지 않는다. 반대로 **타입을 모를 때는 이쪽이 맞다** — 8종 중 하나를
 * 골라 보여주면 그게 곧 거짓이 된다. thinking 표정을 쓰는 이유도 같다.
 */
export const UNKNOWN_FACE_SRC = '/mascot/base_face_thinking.png';

export type DecorationSlot = 'head' | 'eyes';

export interface Decoration {
  id: number;
  label: string;
  src: string;
  slot: DecorationSlot;
  /** 캐릭터 컨테이너 기준 배치(%) — 각 PNG 안에서 그림이 놓인 위치가 서로 달라 보정값이 다르다 */
  box: { left: number; top: number; size: number };
}

// 데코 PNG 6종(느낌표·하트·구름·왕관·리본·꽃)은 전부 자기 캔버스의 중심(약 48%, 46%) 부근에
// 그려져 있어 머리 위(head)에 얹는 공통 배치 하나로 충분하다. 선글라스만 캔버스 전체 폭에 걸쳐
// 넓게 그려져 있고 세로 중심이 달라, 눈 위치(eyes)에 맞춘 별도 배치가 필요하다.
const HEAD_BOX = { left: 27, top: -6, size: 46 };
const EYES_BOX = { left: 17, top: 13, size: 62 };

export const DECORATIONS: Decoration[] = [
  { id: 1, label: '느낌표', src: '/mascot/decoration_1.png', slot: 'head', box: HEAD_BOX },
  { id: 2, label: '하트', src: '/mascot/decoration_2.png', slot: 'head', box: HEAD_BOX },
  { id: 3, label: '구름', src: '/mascot/decoration_3.png', slot: 'head', box: HEAD_BOX },
  { id: 4, label: '왕관', src: '/mascot/decoration_4.png', slot: 'head', box: HEAD_BOX },
  { id: 5, label: '리본', src: '/mascot/decoration_5.png', slot: 'head', box: HEAD_BOX },
  { id: 6, label: '꽃', src: '/mascot/decoration_6.png', slot: 'head', box: HEAD_BOX },
  { id: 7, label: '선글라스', src: '/mascot/decoration_7.png', slot: 'eyes', box: EYES_BOX },
];
