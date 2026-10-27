import { useState } from 'react';
import { motion } from 'framer-motion';
import type { SkinType } from '../../data/skinTypes';
import { RESULT_DETAILS } from '../../data/skinTypes';

interface ResultCardScreenProps {
  /** 1순위 타입 */
  resultType: SkinType;
  /** 1·2순위 후보(순서대로). 2개일 때만 고르는 화면이 된다. 그 밖에는 1순위 하나만 보여 준다 */
  choices?: SkinType[];
  onClose: () => void | Promise<void>;
  /** 고른 타입 id로 확정한다. false면 저장하지 못한 것이라 화면에 머문다 */
  onConfirm: (skinTypeId: string) => Promise<boolean>;
}

// Figma "수부지" (node 433:403). 배경은 assets/bg/<id>.png.
// 배지 · 태그라인 · 해시태그는 RESULT_DETAILS[id]에 있을 때만 노출.
// 진단은 1순위와 2순위를 같이 내므로, 둘 중 하나를 골라 확정한다.
export default function ResultCardScreen({ resultType, choices, onClose, onConfirm }: ResultCardScreenProps) {
  const options = choices && choices.length === 2 ? choices : null;
  const [pickedId, setPickedId] = useState(resultType.id);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const shown = options?.find((o) => o.id === pickedId) ?? resultType;
  const detail = RESULT_DETAILS[shown.id];
  const t = shown.theme;

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await onConfirm(shown.id);
    setSaving(false);
    if (!ok) setFailed(true);
  };

  return (
    <motion.div
      className="absolute inset-0 flex flex-col overflow-hidden bg-ob-bg"
      style={{
        paddingBottom: 'var(--safe-bottom)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 상단 닫기. 노치 인셋은 body의 --safe-top이 담당하고 pt-11은 디자인 여백이다 */}
      <div className="flex justify-end px-5 pt-11">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid h-9 w-9 place-items-center rounded-full"
          style={{ background: t.deep }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4 pt-10">
        <p className="text-center text-[21px] font-bold text-black">당신의 피부 타입은....</p>

        {/* 결과 카드 */}
        <div
          className="relative mt-8 overflow-hidden rounded-[18px] border bg-cover bg-center px-5 pb-5 pt-4"
          style={{ borderColor: t.border, backgroundImage: `url(${shown.bg})` }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <span
              className="rounded-full px-3 py-1 text-[12px] font-medium text-white"
              style={{ background: t.accent }}
            >
              {detail?.badge ?? `${shown.label} 타입`}
            </span>
            <p
              className="text-[28px] font-black leading-tight tracking-tight"
              style={{ color: t.accent, textShadow: `1.5px 1.5px 0 ${t.titleShadow}` }}
            >
              {shown.short} 피부
            </p>
            <img
              src={shown.image}
              alt={shown.label}
              draggable={false}
              className="my-1 w-[150px] select-none"
            />
            {detail && (
              <div className="flex gap-2">
                {detail.hashtags.map((h) => (
                  <span
                    key={h.text}
                    className="rounded-full px-3 py-1 text-[13px] font-medium"
                    style={{ color: h.color, background: h.bg }}
                  >
                    {h.text}
                  </span>
                ))}
              </div>
            )}
            {detail ? (
              <p className="mt-1.5 text-center text-[14px] leading-[1.6]" style={{ color: t.cardText }}>
                {detail.taglineLead}
                <br />
                {detail.taglineRest}
                <span style={{ color: t.accent }}>{detail.taglineHighlight}</span>
                {detail.taglineTail}
              </p>
            ) : (
              <p className="mt-1.5 text-center text-[14px] leading-[1.6]" style={{ color: t.cardText }}>
                {shown.description}
              </p>
            )}
          </div>
        </div>

        {/* 카드 아래: 1·2순위 중 고르기. 순위 안내는 카드 밖 글로 적는다 */}
        {options && (
          <>
            <div role="radiogroup" aria-label="피부 타입 선택" className="mt-6 grid grid-cols-2 gap-2.5">
              {options.map((o, i) => {
                const on = o.id === pickedId;
                return (
                  <div key={o.id} className="flex flex-col items-center">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPickedId(o.id)}
                      className="flex w-full flex-col items-center gap-0.5 rounded-[14px] border-2 bg-white px-2 py-2.5 transition-colors"
                      style={{ borderColor: on ? o.theme.accent : '#E6E6E6' }}
                    >
                      <img src={o.image} alt="" draggable={false} className="h-14 select-none" />
                      <span className="text-[14px] font-bold" style={{ color: on ? o.theme.accent : '#333' }}>
                        {o.short} 피부
                      </span>
                    </button>
                    {/* 순위 안내는 선택 카드 밖, 각 카드 아래에 */}
                    <p className="mt-1.5 text-[12px] font-semibold" style={{ color: o.theme.accent }}>{i === 0 ? '가장 가까워요' : '다음으로 가까워요'}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 하단: 고른 타입으로 확정하고 맞춤 추천으로 */}
      <div className="px-6 pb-[25px] pt-2">
        {failed && (
          <p role="alert" className="mb-2 text-center text-[12px] text-red-500">
            선택을 저장하지 못했어요. 잠시 뒤에 다시 눌러 주세요.
          </p>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={saving}
          className="h-12 w-full rounded-full text-[15px] font-medium text-white disabled:opacity-60"
          style={{ background: t.deep }}
        >
          {saving ? '저장하는 중…' : options ? `${shown.short} 피부로 맞춤 추천 받기` : '맞춤 스킨케어 추천 받기'}
        </button>
      </div>
    </motion.div>
  );
}
