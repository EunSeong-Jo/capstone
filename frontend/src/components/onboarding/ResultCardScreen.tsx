import { motion } from 'framer-motion';
import type { SkinType } from '../../data/skinTypes';
import { RESULT_DETAILS } from '../../data/skinTypes';

interface ResultCardScreenProps {
  resultType: SkinType;
  onClose: () => void;
  onRecommend: () => void;
}

// Figma "수부지" (node 433:403). 배경은 assets/bg/<id>.png.
// 배지 · 태그라인 · 해시태그 · 추천 성분은 RESULT_DETAILS[id]에 있을 때만 노출.
export default function ResultCardScreen({ resultType, onClose, onRecommend }: ResultCardScreenProps) {
  const detail = RESULT_DETAILS[resultType.id];
  const t = resultType.theme;

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
          className="relative mt-8 overflow-hidden rounded-[18px] border px-5 pb-5 pt-4"
          style={{ borderColor: t.border, background: t.border ? `${t.border}22` : undefined }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <span
              className="rounded-full px-3 py-1 text-[12px] font-medium text-white"
              style={{ background: t.accent }}
            >
              {detail?.badge ?? `${resultType.label} 타입`}
            </span>
            <p
              className="text-[28px] font-black leading-tight tracking-tight"
              style={{ color: t.accent, textShadow: `1.5px 1.5px 0 ${t.titleShadow}` }}
            >
              {resultType.short} 피부
            </p>
            <img
              src={resultType.image}
              alt={resultType.label}
              draggable={false}
              className="my-1 w-[100px] select-none"
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
                {resultType.description}
              </p>
            )}
          </div>
        </div>

        {/* 추천하는 성분 */}
        {detail && (
          <>
            <p className="mt-6 text-[15px] font-semibold text-black">추천하는 성분</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {detail.ingredients.map((ing) => (
                <div
                  key={ing.name}
                  className="flex flex-col items-center rounded-[9px] bg-white p-2"
                  style={{ boxShadow: '0 0 1.5px rgba(0,0,0,0.6)' }}
                >
                  <div
                    className="mb-1.5 h-11 w-full rounded-[7px]"
                    style={{ background: ing.tagBg }}
                  />
                  <p className="text-center text-[11px] font-semibold leading-tight text-black">
                    {ing.name}
                  </p>
                  <span
                    className="mt-1 rounded-full px-1.5 py-[1px] text-[9px] font-medium"
                    style={{ color: ing.tagColor, background: ing.tagBg }}
                  >
                    {ing.tag}
                  </span>
                  <p className="mt-1 text-center text-[9px] leading-tight" style={{ color: '#aaa' }}>
                    {ing.desc}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 하단: 맞춤 스킨케어 추천 받기 */}
      <div className="px-6 pb-[25px] pt-2">
        <button
          type="button"
          onClick={onRecommend}
          className="h-12 w-full rounded-full text-[15px] font-medium text-white"
          style={{ background: t.deep }}
        >
          맞춤 스킨케어 추천 받기
        </button>
      </div>
    </motion.div>
  );
}
