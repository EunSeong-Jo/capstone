import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import MembershipManager from '../../components/membership/MembershipManager';
import FacePhotoScreen from '../../components/onboarding/FacePhotoScreen';
import SkinAnalysisDetail from '../../components/skin/SkinAnalysisDetail';
import { AnalysisDto } from '../../api/skinPhoto';
import { ApiError } from '../../api/client';
import { QUESTION_COUNT } from '../../data/onboarding';
import { useAuth } from '../../context/auth';
import { useDiagnosis } from '../../context/diagnosis';
import { useToast } from '../../context/toast';
import { invalidateSkinPhoto, useAnalysisHistory, useQuota, useSubscription } from '../../hooks/useSkinPhoto';

/**
 * AI 피부관리 — 이용 현황·촬영·구독 안내(멤버십 모달)·분석 기록. (얼굴 사진 동의의 확인·철회는 설정 > 얼굴 사진 수집·이용 동의)
 *
 * **구독은 결제 없이 기록만 만드는 데모다**(PG 연동이 없다). 화면에도 그렇게 적는다.
 *
 * 한도는 월 단위다: 얼굴 사진 수집에 동의한 무료 사용자 월 1회, 구독자 월 4회(주 1회씩
 * 쓰기를 권한다 — 주별로 막지는 않는다). 분석은 두 곳에서 한다: 문답(QnA) 재진단 흐름 안에서,
 * 또는 여기서 **지금 촬영하기**(문답 없이). 촬영만으로는 피부타입 진단을 바꾸지 않는다 — 결과 화면의
 * '이 결과로 피부타입 진단 갱신'을 눌러 확인해야 한다(추천 제품이 바뀌기 때문).
 *
 * 분석 기록은 연도와 월·일 드롭다운으로 고른다. 같은 날 여러 번 분석했으면 시각 드롭다운이 더해져 그날의 분석을 하나씩 고를 수 있다(기본은 그날 마지막).
 */
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

/** 분석 시각을 (연도, 월-일)로. 시각은 쓰지 않는다 */
const yearOf = (iso: string) => new Date(iso).getFullYear();
const mdOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
/** 비교 라벨: 이웃 분석과 같은 날이면 구분되게 시각을 붙인다 */
const stamp = (a: { createdAt: string }, other: { createdAt: string } | null) =>
  other && mdOf(a.createdAt) === mdOf(other.createdAt) && yearOf(a.createdAt) === yearOf(other.createdAt)
    ? `${fmtDate(a.createdAt)} ${timeOf(a.createdAt)}`
    : fmtDate(a.createdAt);
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
  const { scope } = useAuth();
  const { showToast } = useToast();
  const { quota, loading: quotaLoading, reload: reloadQuota } = useQuota();
  const { subscription, loading: subLoading, reload: reloadSub } = useSubscription();

  const [membershipOpen, setMembershipOpen] = useState(false);
  const { diagnoseWithPhoto } = useDiagnosis();
  const { history, loading: historyLoading, failed: historyFailed, reload: reloadHistory } = useAnalysisHistory();
  const [shooting, setShooting] = useState(false);
  const [pending, setPending] = useState<AnalysisDto | null>(null);
  const [applying, setApplying] = useState(false);
  // 드롭다운에서 고른 연도·월일. 목록에 없으면(처음·새 분석 뒤) 가장 최근 것으로 본다.
  const [selYear, setSelYear] = useState<number | null>(null);
  const [selMd, setSelMd] = useState<string | null>(null);
  // 같은 날 분석이 여러 건일 때 고른 분석 id
  const [selId, setSelId] = useState<string | null>(null);

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

  const loading = quotaLoading || subLoading;
  const subscribed = subscription?.active === true;
  const cancelled = subscription?.status === 'cancelled';
  const canShoot = !quota || !quota.consentGranted || quota.remaining > 0;

  // 기록 드롭다운: 연도 → 그 해의 월·일. history는 최신순이다.
  const years = history ? [...new Set(history.map((a) => yearOf(a.createdAt)))] : [];
  const year = selYear !== null && years.includes(selYear) ? selYear : (years[0] ?? null);
  const days = history ? [...new Set(history.filter((a) => yearOf(a.createdAt) === year).map((a) => mdOf(a.createdAt)))] : [];
  const md = selMd !== null && days.includes(selMd) ? selMd : (days[0] ?? null);
  // 그날의 분석들(최신순). 고른 것이 없으면 가장 마지막(=목록에서 가장 앞)
  const dayItems = history ? history.filter((a) => yearOf(a.createdAt) === year && mdOf(a.createdAt) === md) : [];
  const selected = dayItems.find((a) => a.analysisId === selId) ?? dayItems[0] ?? null;
  const selectedIndex = history && selected ? history.indexOf(selected) : -1;
  const before = selectedIndex >= 0 && history ? (history[selectedIndex + 1] ?? null) : null;

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="AI 피부관리" />

      <div className="flex flex-col gap-4 px-4 pb-10 pt-4">
        {/* 소개 */}
        <section className="rounded-2xl bg-ob-green px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <p className="pt-1 text-[12px] font-semibold opacity-90">AI 피부관리 구독</p>
            <button
              type="button"
              onClick={() => setMembershipOpen(true)}
              disabled={subLoading}
              className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-extrabold text-ob-green-deep active:scale-95 disabled:opacity-60"
            >
              {subscribed && !cancelled ? '구독 중' : cancelled && subscribed ? '해지 예정' : '구독'}
            </button>
          </div>
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
          <p className="text-[14px] font-extrabold text-gray-100">이번 달 이용 현황</p>
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
            </>
          )}
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
                      setSelId(null);
                    }}
                    options={years.map((y) => ({ value: String(y), text: `${y}년` }))}
                  />
                  <SelectBox
                    className="w-[94px] shrink-0"
                    label="분석 날짜 선택"
                    value={md}
                    onChange={(v) => {
                      setSelMd(v);
                      setSelId(null);
                    }}
                    options={days.map((d) => ({ value: d, text: mdLabel(d) }))}
                  />
                </div>
              </div>
              {dayItems.length > 1 && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="text-[11px] text-gray-50">이 날 분석 {dayItems.length}번</span>
                  <SelectBox
                    className="w-[94px] shrink-0"
                    label="분석 시각 선택"
                    value={selected.analysisId}
                    onChange={setSelId}
                    options={dayItems.map((a) => ({ value: a.analysisId, text: timeOf(a.createdAt) }))}
                  />
                </div>
              )}
              <p className="mt-0.5 text-[11px] text-gray-50">
                {fmtDate(selected.createdAt)}
                {dayItems.length > 1 && ` ${timeOf(selected.createdAt)}`}
              </p>
              <div className="mt-4">
                <SkinAnalysisDetail
                  key={selected.analysisId}
                  analysis={selected}
                  previous={before}
                  previousLabel={before ? stamp(before, selected) : undefined}
                  currentLabel={stamp(selected, before)}
                  showUpsell={selected.analysisId === history[0].analysisId && !subscribed}
                />
              </div>
            </>
          )}
        </section>
      </div>

      {membershipOpen && <MembershipManager onClose={() => setMembershipOpen(false)} onChanged={refresh} />}

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
