import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FaceConsentList } from '../../components/skin/FaceConsentSheet';
import SkinAnalysisDetail from '../../components/skin/SkinAnalysisDetail';
import {
  AnalysisDto,
  cancelSubscription,
  fetchLatestAnalysis,
  setConsent,
  startSubscription,
} from '../../api/skinPhoto';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { invalidateSkinPhoto, useQuota, useSubscription } from '../../hooks/useSkinPhoto';
import { FACE_CONSENT_TITLE } from '../../data/faceConsent';

/**
 * AI 피부관리 — 이용 현황·구독·얼굴 사진 동의.
 *
 * **구독은 결제 없이 기록만 만드는 데모다**(PG 연동이 없다). 화면에도 그렇게 적는다.
 *
 * 한도는 월 단위다: 얼굴 사진 수집에 동의한 무료 사용자 월 1회, 구독자 월 4회(주 1회씩
 * 쓰기를 권한다 — 주별로 막지는 않는다). 분석은 문답(QnA) 재진단 흐름의 한 단계로 이뤄지므로
 * "지금 분석하기"는 재진단으로 이어 준다.
 */
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { scope } = useAuth();
  const { showToast } = useToast();
  const { quota, loading: quotaLoading, reload: reloadQuota } = useQuota();
  const { subscription, loading: subLoading, reload: reloadSub } = useSubscription();

  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [latest, setLatest] = useState<AnalysisDto | null>(null);
  const [latestChecked, setLatestChecked] = useState(false);

  // 최근 분석. 기록이 없으면(404) 섹션을 그리지 않는다.
  useEffect(() => {
    let alive = true;
    fetchLatestAnalysis()
      .then((a) => alive && setLatest(a))
      .catch(() => undefined)
      .finally(() => alive && setLatestChecked(true));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = () => {
    invalidateSkinPhoto(scope);
    reloadQuota();
    reloadSub();
  };

  const run = async (job: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await job();
      refresh();
      showToast(done);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const loading = quotaLoading || subLoading;
  const subscribed = subscription?.active === true;
  const cancelled = subscription?.status === 'cancelled';

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="AI 피부관리" />

      <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
        {/* 소개 */}
        <section className="rounded-2xl bg-ob-green px-5 py-5 text-white">
          <p className="text-[12px] font-semibold opacity-90">AI 피부관리 구독</p>
          <p className="mt-1 text-[19px] font-extrabold leading-snug">
            매주 한 번, AI와 함께
            <br />
            내 피부를 살펴봐요
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-[12px] leading-relaxed opacity-95">
            <li>· 한 달에 4번, 주 1회씩 촬영하는 걸 추천해요</li>
            <li>· 유분·수분·홍조·잡티·트러블·모공·주름 외 탄력·광채·피부결·다크서클까지 12가지</li>
            <li>· 문답 결과와 합쳐 피부타입을 더 꼼꼼하게</li>
          </ul>
        </section>

        {/* 이용 현황 */}
        <section className="rounded-2xl bg-white px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-extrabold text-gray-100">이번 달 이용 현황</p>
            {quota && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  quota.plan === 'subscriber' ? 'bg-ob-green text-white' : 'bg-gray-10 text-gray-70'
                }`}
              >
                {quota.plan === 'subscriber' ? '구독 중' : '무료'}
              </span>
            )}
          </div>
          {loading || !quota ? (
            <div className="mt-4 h-10 animate-pulse rounded-xl bg-gray-10" />
          ) : (
            <>
              <p className="mt-3 text-[28px] font-extrabold text-ob-green-deep">
                {quota.remaining}
                <span className="text-[14px] font-semibold text-gray-50"> / {quota.allowance}회 남음</span>
              </p>
              <p className="mt-1 text-[11px] text-gray-50">
                {fmtDate(quota.resetsAt)}에 새로 채워져요 · 분석 항목 {quota.concernCount}가지
              </p>
              {!quota.consentGranted && (
                <p className="mt-2 rounded-lg bg-accent-light px-3 py-2 text-[11px] font-semibold text-accent">
                  얼굴 사진 수집에 동의해야 분석을 쓸 수 있어요. 아래에서 동의할 수 있어요.
                </p>
              )}
              <button
                type="button"
                onClick={() => navigate('/qna')}
                disabled={!quota.consentGranted || quota.remaining <= 0}
                className="mt-4 h-12 w-full rounded-xl bg-ob-green text-[14px] font-semibold text-white active:scale-[.98] disabled:opacity-40"
              >
                재진단하며 AI 분석 받기
              </button>
            </>
          )}
        </section>

        {/* 구독 */}
        <section className="rounded-2xl bg-white px-5 py-4">
          <p className="text-[14px] font-extrabold text-gray-100">구독</p>
          {subLoading ? (
            <div className="mt-3 h-10 animate-pulse rounded-xl bg-gray-10" />
          ) : subscribed && subscription?.currentPeriodEnd ? (
            <>
              <p className="mt-2 text-[13px] text-gray-70">
                {cancelled
                  ? `해지했어요. ${fmtDate(subscription.currentPeriodEnd)}까지는 계속 쓸 수 있어요.`
                  : `${fmtDate(subscription.currentPeriodEnd)}까지 이용할 수 있어요.`}
              </p>
              {cancelled ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(startSubscription, '구독을 다시 시작했어요')}
                  className="mt-3 h-11 w-full rounded-xl bg-ob-green text-[13px] font-semibold text-white active:scale-[.98] disabled:opacity-50"
                >
                  해지 취소하고 계속 이용
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmCancel(true)}
                  className="mt-3 h-11 w-full rounded-xl border border-gray-20 text-[13px] font-semibold text-gray-70 active:scale-[.98] disabled:opacity-50"
                >
                  구독 해지
                </button>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-70">
                구독하면 매달 4회, 12가지 항목으로 분석해요.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(startSubscription, '구독을 시작했어요')}
                className="mt-3 h-12 w-full rounded-xl bg-ob-green text-[14px] font-semibold text-white active:scale-[.98] disabled:opacity-50"
              >
                구독 시작하기
              </button>
            </>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-gray-50">
            데모 화면이에요. 실제 결제는 일어나지 않아요.
          </p>
        </section>

        {/* 동의 */}
        <section className="rounded-2xl bg-white px-5 py-4">
          <p className="text-[14px] font-extrabold text-gray-100">{FACE_CONSENT_TITLE}</p>
          <p className="mt-1 text-[12px] text-gray-50">
            {quota?.consentGranted ? '동의했어요. 언제든 철회할 수 있어요.' : '아직 동의하지 않았어요.'}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-semibold text-ob-green-deep">
              동의 내용 보기
            </summary>
            <FaceConsentList className="mt-3" />
          </details>
          {quota?.consentGranted ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmWithdraw(true)}
              className="mt-3 h-11 w-full rounded-xl border border-gray-20 text-[13px] font-semibold text-gray-70 active:scale-[.98] disabled:opacity-50"
            >
              동의 철회
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => run(() => setConsent(true), '동의했어요')}
              className="mt-3 h-11 w-full rounded-xl bg-ob-green text-[13px] font-semibold text-white active:scale-[.98] disabled:opacity-50"
            >
              동의하기
            </button>
          )}
        </section>

        {/* 최근 분석 */}
        {latestChecked && latest && (
          <section className="rounded-2xl bg-white px-5 py-4">
            <p className="text-[14px] font-extrabold text-gray-100">최근 분석</p>
            <p className="mb-3 mt-0.5 text-[11px] text-gray-50">{fmtDate(latest.createdAt)}</p>
            <SkinAnalysisDetail analysis={latest} showUpsell={!subscribed} />
          </section>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="구독을 해지할까요?"
          description="이번 이용 기간이 끝날 때까지는 계속 쓸 수 있어요."
          confirmLabel="해지"
          cancelLabel="유지"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false);
            void run(cancelSubscription, '구독을 해지했어요');
          }}
        />
      )}
      {confirmWithdraw && (
        <ConfirmDialog
          title="동의를 철회할까요?"
          description="철회하면 얼굴 사진 분석을 쓸 수 없어요. 이미 만든 분석 점수는 계정을 삭제할 때 함께 지워져요."
          confirmLabel="철회"
          cancelLabel="유지"
          danger
          onCancel={() => setConfirmWithdraw(false)}
          onConfirm={() => {
            setConfirmWithdraw(false);
            void run(() => setConsent(false), '동의를 철회했어요');
          }}
        />
      )}
    </PageWrapper>
  );
}
