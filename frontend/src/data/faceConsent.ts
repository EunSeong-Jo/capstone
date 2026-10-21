/**
 * 얼굴 사진 수집·이용 동의 문구.
 *
 * 가입 화면, 촬영 직전 동의, 마이페이지(구독) 세 곳이 같은 문구를 쓴다. 문구를 바꾸면
 * 서버의 `FACE_CONSENT_VERSION`(config.py)도 올려야 한다 — 올리면 옛 동의는 현재 문구에
 * 대한 동의로 보지 않아 촬영 직전에 다시 받는다.
 *
 * ⚠️ 데모용 문구다. 실서비스 전에 법무 검토가 필요하다(개인정보 처리방침은
 * `pages/Mypage/LegalPage.tsx`).
 */
export const FACE_CONSENT_TITLE = '얼굴 사진 수집·이용 동의 (선택)';

export interface ConsentItem {
  label: string;
  body: string;
}

export const FACE_CONSENT_ITEMS: ConsentItem[] = [
  { label: '수집 항목', body: '피부 분석을 위해 직접 촬영하거나 고른 얼굴 사진 1장' },
  {
    label: '이용 목적',
    body: 'AI 피부 분석(유분·수분·홍조·잡티·트러블 등)으로 피부타입 진단을 보조하고 분석 결과를 보여 드립니다.',
  },
  {
    label: '보관',
    body: '사진 원본은 서버에 저장하지 않고 분석이 끝나는 즉시 폐기합니다. 분석 점수와 항목별 분석 결과 이미지(얼굴 사진은 포함되지 않음)는 지난 결과를 다시 볼 수 있도록 서버에 보관하며, 동의를 철회하거나 계정을 삭제하면 이미지는 즉시, 점수는 계정 삭제 때 함께 삭제됩니다.',
  },
  {
    label: '국외 이전',
    body: '분석을 위해 사진이 해외에 있는 분석 업체(Perfect Corp.)의 서버로 전송됩니다.',
  },
  {
    label: '동의하지 않으면',
    body: '가입과 문답(QnA) 피부타입 진단은 그대로 쓸 수 있고, 얼굴 사진 분석만 이용할 수 없어요.',
  },
  { label: '철회', body: '마이페이지 > AI 피부관리에서 언제든 동의를 철회할 수 있어요.' },
];

/** 서비스를 쓰려는 순간 뜨는 약식 동의에 보여 주는 핵심 세 줄. 전문은 `FACE_CONSENT_ITEMS` */
export const FACE_CONSENT_SUMMARY: string[] = [
  '얼굴 사진 1장으로 AI가 피부를 분석해요. 원본 사진은 저장하지 않아요.',
  '분석 점수와 분석 결과 이미지(얼굴 사진 아님)는 내 계정에만 보관돼요. 동의를 철회하면 이미지가, 탈퇴하면 점수까지 삭제돼요.',
  '분석을 위해 사진이 해외 분석 업체(Perfect Corp.)로 전송돼요.',
];

export const FACE_CONSENT_CHECKBOX = '[선택] 얼굴 사진 수집·이용에 동의합니다';
export const FACE_CONSENT_BENEFIT = '동의하면 매달 1회 AI 얼굴 분석을 무료로 이용할 수 있어요';
