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
    body: '사진 원본은 서버에 저장하지 않고 분석이 끝나는 즉시 폐기합니다. 분석 점수만 계정에 남으며 계정을 삭제하면 함께 삭제됩니다.',
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

export const FACE_CONSENT_CHECKBOX = '[선택] 얼굴 사진 수집·이용에 동의합니다';
export const FACE_CONSENT_BENEFIT = '동의하면 매달 1회 AI 얼굴 분석을 무료로 이용할 수 있어요';
