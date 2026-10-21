import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import FacePhotoScreen from '../../components/onboarding/FacePhotoScreen';
import SkinAnalysisDetail from '../../components/skin/SkinAnalysisDetail';
import { AnalysisDto, cancelSubscription, startSubscription } from '../../api/skinPhoto';
import { ApiError } from '../../api/client';
import { QUESTION_COUNT } from '../../data/onboarding';
import { useAuth } from '../../context/auth';
import { useDiagnosis } from '../../context/diagnosis';
import { useToast } from '../../context/toast';
import { invalidateSkinPhoto, useAnalysisHistory, useQuota, useSubscription } from '../../hooks/useSkinPhoto';

/**
 * AI 피부관리 — 이용 현황·촬영·구독·분석 기록. (얼굴 사진 동의의 확인·철회는 설정 > 얼굴 사진 수집·이용 동의)
 *
 * **구독은 결제 없이 기록만 만드는 데모다**(PG 연동이 없다). 화면에도 그렇게 적는다.
 *
 * 한도는 월 단위다: 얼굴 사진 수집에 동의한 무료 사용자 월 1회, 구독자 월 4회(주 1회씩
 * 쓰기를 권한다 — 주별로 막지는 않는다). 분석은 두 곳에서 한다: 문답(QnA) 재진단 흐름 안에서,
 * 또는 여기서 **지금 촬영하기**(문답 없이). 촬영만으로는 피부타입 진단을 바꾸지 않는다 — 결과 화면의
 * '이 결과로 피부타입 진단 갱신'을 눌러 확인해야 한다(추천 제품이 바뀌기 때문).
 *
 * 분석 기록은 연도와 월·일 드롭다운으로 고른다. 같은 날 여러 번 분석했으면 그날의 마지막 결과를 보여 준다.
 */
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

/** 분석 시각을 (연도, 월-일)로. 시각은 쓰지 않는다 */
const yearOf = (iso: string) => new Date(iso).getFullYear();
const mdOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mdLabel = (md: string) => `${Number(md.slice(0, 2))}월 ${Number(md.slice(3))}일`;

const selectClass =
  'h-9 w-full appearance-none rounded-xl border border-gray-20 bg-white py-0 pl-2 pr-[18px] text-[11px] font-semibold text-gray-100 focus:border-ob-green focus:outline-none';

function SelectBox({
  label,
  value,
  onChange,
  options,
  className = 'flex-1',
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; text: string }[];
}) {
  return (
    <label className={`relative block min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
      >
        <path d="M6 9l6 6 6-6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const { scope } = useAuth();
  const { showToast } = useToast();
  const { quota, loading: quotaLoading, reload: reloadQuota } = useQuota();
  const { subscription, loading: subLoading, reload: reloadSub } = useSubscription();

  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { diagnoseWithPhoto } = useDiagnosis();
  const { history, loading: historyLoading, failed: historyFailed, reload: reloadHistory } = useAnalysisHistory();
  const [shooting, setShooting] = useState(false);
  const [pending, setPending] = useState<AnalysisDto | null>(null);
  const [applying, setApplying] = useState(false);
  // 드롭다운에서 고른 연도·월일. 목록에 없으면(처음·새 분석 뒤) 가장 최근 것으로 본다.
  const [selYear, setSelYear] = useState<number | null>(null);
  const [selMd, setSelMd] = useState<string | null>(null);

  const refresh = () => {
    invalidateSkinPhoto(scope);
    reloadQuota();
    reloadSub();
    reloadHistory();
  };

  const apply = async () => {
    if (!pending) return;
    setApplying(true);
    try {
      // 답한 문항이 없다 — 서버가 사진 5축만으로 진단한다.
      await diagnoseWithPhoto(Array(QUESTION_COUNT).fill(null), pending.analysisId);
      showToast('피부타입 진단을 갱신했어요');
      setPending(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '갱신하지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    } finally {
      setApplying(false);
    }
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
  const canShoot = !quota || !quota.consentGranted || quota.remaining > 0;

  // 기록 드롭다운: 연도 → 그 해의 월·일. history는 최신순이다.
  const years = history ? [...new Set(history.map((a) => yearOf(a.createdAt)))] : [];
  const year = selYear !== null && years.includes(selYear) ? selYear : (years[0] ?? null);
  const days = history ? [...new Set(history.filter((a) => yearOf(a.createdAt) === year).map((a) => mdOf(a.createdAt)))] : [];
  const md = selMd !== null && days.includes(selMd) ? selMd : (days[0] ?? null);
  // 그날 가장 마지막(=목록에서 가장 앞) 분석
  const selectedIndex = history ? history.findIndex((a) => yearOf(a.createdAt) === year && mdOf(a.createdAt) === md) : -1;
  const selected = selectedIndex >= 0 && history ? history[selectedIndex] : null;
  const before = selectedIndex >= 0 && history ? (history[selectedIndex + 1] ?? null) : null;

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
            <li>· 유분·수분·홍조·잡티·트러블·모공·주름 외 탄력·광채·피부결·다크서클·눈가까지 16가지</li>
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
                <p className="mt-2 rounded-lg bg-gray-5 px-3 py-2 text-[11px] text-gray-70">
                  처음 촬영할 때 얼굴 사진 수집 동의 화면이 나와요.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShooting(true)}
                disabled={!canShoot}
                className="mt-4 h-12 w-full rounded-xl bg-ob-green text-[14px] font-semibold text-white active:scale-[.98] disabled:opacity-40"
              >
                지금 촬영하기
              </button>
              <button
                type="button"
                onClick={() => navigate('/qna')}
                disabled={quota.remaining <= 0}
                className="mt-2 h-11 w-full rounded-xl border border-ob-green text-[13px] font-semibold text-ob-green-deep active:scale-[.98] disabled:opacity-40"
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
                구독하면 매달 4회, 16가지 항목으로 분석해요.
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

        {/* 분석 기록 — 연도·월일 드롭다운으로 지난 분석을 고른다(1회만 분석했어도 보여 준다) */}
        <section className="rounded-2xl bg-white px-5 py-4">
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-ob-green border-t-transparent" />
            </div>
          ) : historyFailed ? (
            <div className="py-5 text-center">
              <p className="text-[13px] text-gray-70">분석 기록을 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={reloadHistory}
                className="mt-3 h-10 rounded-xl bg-gray-5 px-5 text-[12px] font-semibold text-gray-100"
              >
                다시 시도
              </button>
            </div>
          ) : !history || history.length === 0 || !selected || year === null || md === null ? (
            <div className="py-6 text-center">
              <p className="text-[14px] font-bold text-gray-100">아직 분석 기록이 없어요</p>
              <p className="mt-1 text-[12px] text-gray-50">사진을 한 번 찍으면 여기에 쌓여요.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-extrabold text-gray-100">
                  {selected.analysisId === history[0].analysisId ? '최근 분석' : '지난 분석'}
                </p>
                <div className="flex w-[176px] shrink-0 gap-2">
                  <SelectBox
                    className="w-[74px] shrink-0"
                    label="분석 연도 선택"
                    value={String(year)}
                    onChange={(v) => {
                      setSelYear(Number(v));
                      setSelMd(null);
                    }}
                    options={years.map((y) => ({ value: String(y), text: `${y}년` }))}
                  />
                  <SelectBox
                    className="w-[94px] shrink-0"
                    label="분석 날짜 선택"
                    value={md}
                    onChange={setSelMd}
                    options={days.map((d) => ({ value: d, text: mdLabel(d) }))}
                  />
                </div>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-50">{fmtDate(selected.createdAt)}</p>
              <div className="mt-4">
                <SkinAnalysisDetail
                  key={selected.analysisId}
                  analysis={selected}
                  previous={before}
                  previousLabel={before ? fmtDate(before.createdAt) : undefined}
                  currentLabel={fmtDate(selected.createdAt)}
                  showUpsell={selected.analysisId === history[0].analysisId && !subscribed}
                />
              </div>
            </>
          )}
        </section>
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
      {shooting && (
        <div className="fixed inset-0 z-50 mx-auto max-w-[430px] bg-white">
          <FacePhotoScreen
            standalone={{
              doneLabel: '확인',
              note: '이 분석은 AI 피부관리 기록에 쌓여요.',
              applyLabel: '이 결과로 피부타입 진단 갱신',
            }}
            onBack={() => setShooting(false)}
            onDone={(analysis) => {
              setShooting(false);
              if (analysis) refresh();
            }}
            onApply={(analysis) => {
              setShooting(false);
              refresh();
              setPending(analysis);
            }}
          />
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="피부타입 진단을 갱신할까요?"
          description="이 사진의 분석 결과만으로 피부타입을 다시 정해요. 추천 제품이 새 타입 기준으로 바뀔 수 있어요."
          confirmLabel={applying ? '갱신 중…' : '갱신'}
          cancelLabel="취소"
          onCancel={() => !applying && setPending(null)}
          onConfirm={() => void apply()}
        />
      )}
    </PageWrapper>
  );
}
