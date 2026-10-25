import { useState } from 'react';
import FacePhotoScreen from '../onboarding/FacePhotoScreen';
import { useAuth } from '../../context/auth';
import { invalidateSkinPhoto, useQuota } from '../../hooks/useSkinPhoto';

/**
 * AI 피부 분석(얼굴 사진) 유도.
 *
 * 성분 분석의 "내 피부 상태와 견주면"은 사진 분석이 가장 객관적인 기준이라 사진이 없으면 촬영을 안내한다.
 * 막지는 않는다 — 제품 분석(핵심 성분·기능·주의 성분 등)은 사진 없이 볼 수 있고, 얼굴 사진 동의는 선택이다.
 * 촬영·동의는 `FacePhotoScreen`이 처리한다(처음 한 번만 동의를 받고, 이후 철회는 마이페이지에서 한다).
 *
 * compact: 이미 문답 기준으로 보여 주는 중일 때의 한 줄 안내. 아니면 설명이 있는 카드.
 */
export function PhotoCta({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  /** 촬영·분석을 마쳤을 때 (분석 이력을 다시 읽는다) */
  onDone: () => void;
}) {
  const { scope, isUser } = useAuth();
  const { quota } = useQuota();
  const [shooting, setShooting] = useState(false);

  if (!isUser) return null; // 사진 분석은 로그인 전용

  const left =
    quota && quota.consentGranted
      ? quota.remaining > 0
        ? `이번 달 ${quota.remaining}회 남았어요`
        : '이번 달 분석 횟수를 모두 썼어요'
      : '처음이면 안내에 따라 동의 후 촬영해요';
  const disabled = !!quota && quota.consentGranted && quota.remaining <= 0;

  return (
    <>
      {compact ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShooting(true)}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-primary/40 bg-primary-light px-3.5 py-2.5 text-left disabled:opacity-60"
        >
          <span className="text-[13px] leading-snug text-oy-text">
            <b className="text-primary">AI 사진 분석</b>을 받으면 내 피부에 더 정확하게 맞춰 드려요
            <span className="block text-[11px] text-oy-sub">{left}</span>
          </span>
          <span className="shrink-0 text-xs font-bold text-primary">촬영 ›</span>
        </button>
      ) : (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary-light px-4 py-4">
          <p className="text-sm font-bold text-oy-text">📷 사진 한 장이면 내 피부에 맞춰 알려드려요</p>
          <p className="mt-1 text-[13px] leading-snug text-oy-sub">
            AI가 수분·유분·민감도·색소·트러블을 측정하면, 이 제품이 내 피부 상태에 얼마나 도움이 되는지 풀어서 보여 드려요.
            한 번 분석한 결과는 다른 제품에도 그대로 써요.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShooting(true)}
            className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white active:scale-[.98] disabled:opacity-50"
          >
            AI 피부 분석 받기
          </button>
          <p className="mt-1.5 text-center text-[11px] text-oy-sub">{left}</p>
        </div>
      )}

      {shooting && (
        <div className="fixed inset-0 z-50 mx-auto max-w-[430px] bg-white">
          <FacePhotoScreen
            standalone={{ doneLabel: '확인', note: '이 분석은 AI 피부관리 기록에 쌓여요.' }}
            onBack={() => setShooting(false)}
            onDone={(analysis) => {
              setShooting(false);
              if (analysis) {
                invalidateSkinPhoto(scope);
                onDone();
              }
            }}
          />
        </div>
      )}
    </>
  );
}
