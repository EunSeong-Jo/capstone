import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FaceConsentList } from '../../components/skin/FaceConsentSheet';
import { setConsent } from '../../api/skinPhoto';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { invalidateSkinPhoto, useQuota } from '../../hooks/useSkinPhoto';
import { FACE_CONSENT_TITLE } from '../../data/faceConsent';

/**
 * 설정 > 얼굴 사진 수집·이용 동의 — 동의 내용 확인과 **철회**.
 *
 * 동의는 가입할 때(또는 AI 피부진단을 처음 쓸 때 뜨는 동의 화면에서) 받는다. 여기서는 철회만
 * 한다 — 철회하면 저장된 분석 이미지가 바로 삭제되고 사진 분석을 쓸 수 없다. 다시 쓰고 싶으면
 * 촬영할 때 동의 화면이 다시 나온다.
 */
export default function FaceConsentPage() {
  const { scope } = useAuth();
  const { showToast } = useToast();
  const { quota, loading, failed, reload } = useQuota();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const withdraw = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      await setConsent(false);
      invalidateSkinPhoto(scope);
      reload();
      showToast('동의를 철회했어요');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const granted = quota?.consentGranted === true;

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="얼굴 사진 수집·이용 동의" />

      <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
        <section className="rounded-2xl bg-white px-5 py-4">
          <p className="text-[14px] font-extrabold text-gray-100">{FACE_CONSENT_TITLE}</p>
          {loading ? (
            <div className="mt-3 h-6 animate-pulse rounded-lg bg-gray-10" />
          ) : failed || !quota ? (
            <p className="mt-2 text-[12px] text-gray-70">동의 상태를 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.</p>
          ) : granted ? (
            <p className="mt-2 text-[13px] font-semibold text-ob-green-deep">동의했어요</p>
          ) : (
            <p className="mt-2 text-[13px] text-gray-70">
              동의하지 않은 상태예요. AI 피부진단을 처음 쓸 때 동의 화면이 나와요.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white px-5 py-4">
          <p className="text-[13px] font-extrabold text-gray-100">동의 내용</p>
          <FaceConsentList className="mt-3" />
        </section>

        {granted && (
          <section className="rounded-2xl bg-white px-5 py-4">
            <p className="text-[12px] leading-relaxed text-gray-50">
              철회하면 얼굴 사진 분석을 쓸 수 없고, 저장된 분석 이미지는 바로 삭제돼요. 이미 만든 분석 점수는
              회원 탈퇴 때 함께 지워져요.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="mt-3 h-11 w-full rounded-xl border border-gray-20 text-[13px] font-semibold text-gray-70 active:scale-[.98] disabled:opacity-50"
            >
              동의 철회
            </button>
          </section>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title="동의를 철회할까요?"
          description="철회하면 얼굴 사진 분석을 쓸 수 없고, 저장된 분석 이미지는 바로 삭제돼요. 이미 만든 분석 점수는 계정을 삭제할 때 함께 지워져요."
          confirmLabel="철회"
          cancelLabel="유지"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => void withdraw()}
        />
      )}
    </PageWrapper>
  );
}
