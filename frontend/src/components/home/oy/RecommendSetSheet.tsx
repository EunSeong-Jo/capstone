import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBudget } from '../../../hooks/useBudget';
import { BudgetGuidePrefs, useBudgetGuide } from '../../../hooks/useBudgetGuide';
import type { Product, SkinType } from '../../../types';

interface RecommendSetSheetProps {
  open: boolean;
  onClose: () => void;
  nickname: string;
  skinType: SkinType | null;
  /** 화장대 보유품 — 새로 살 루틴에 넣지 않는다 */
  ownedIds: number[];
  onAddAll: (products: Product[]) => void;
}

const won = (n: number) => `${n.toLocaleString()}원`;
/**
 * 선호 조건(무향·무알코올). 칩을 화면에서 뺐다 — 피부타입 규칙이 이미 향료·
 * 알코올을 빼는 타입이 많아 칩을 켜도 결과가 그대로인 경우가 잦았다.
 * API는 조건을 그대로 받으므로 다시 붙일 때 여기만 바꾸면 된다.
 */
const NO_PREFS: BudgetGuidePrefs = { fragranceFree: false, alcoholFree: false };
/** 예산 범위 표기. 20만원 이상은 슬라이더 끝(제한 없음)이다 */
const manwon = (n: number) => (n >= 200_000 ? '20만원 이상' : `${(n / 10_000).toLocaleString()}만원`);

/**
 * 예산 맞춤 추천 세트 — 우하단 '추천세트' 버튼으로 여는 바텀시트 (Task 15).
 *
 * 예전에는 피부타입 맞춤 제품 3개(`/recommendations/set`)를 보여 줬다. 이제는
 * 화장대에 저장한 예산 범위 안에서 토너·에센스·크림·선크림 루틴 1~3안을 낸다
 * (`POST /recommendations/budget`). 예산은 화장대에서 정한다 — 시트에는 예산을
 * 늘어놓지 않고, 제목 옆 안내(ⓘ) 버튼을 누르면 어떤 예산 기준인지 알려 준다.
 *
 * z-40/z-50을 쓰는 이유: FAB이 z-30, OyBottomNav가 z-20이라 그보다 낮으면
 * 시트 위로 버튼들이 비친다.
 */
export function RecommendSetSheet({
  open,
  onClose,
  nickname,
  skinType,
  ownedIds,
  onAddAll,
}: RecommendSetSheetProps) {
  const navigate = useNavigate();
  const { budget, loading: budgetLoading } = useBudget();
  const [tab, setTab] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  // 말풍선과 ⓘ 버튼. 이 둘 밖을 누르면 말풍선을 닫는다.
  const infoRef = useRef<HTMLDivElement>(null);
  // 닫혀 있을 때는 묻지 않는다 — 홈에 들어올 때마다 계산하지 않게.
  const guide = useBudgetGuide(open ? budget : null, skinType, NO_PREFS, ownedIds);

  useEffect(() => {
    if (!infoOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!infoRef.current?.contains(e.target as Node)) setInfoOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [infoOpen]);

  // 열려 있는 동안 뒤 배경이 따라 스크롤되지 않게 막는다.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const combos = guide.data?.combinations ?? [];
  const active = combos[Math.min(tab, Math.max(combos.length - 1, 0))];



  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="예산 맞춤 추천 세트"
        className="fixed bottom-0 left-1/2 z-50 flex max-h-[88dvh] w-full max-w-[430px] -translate-x-1/2 animate-slide-up flex-col rounded-t-3xl bg-white"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
      >
        <div className="px-4 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-oy-line" />
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-extrabold text-oy-text">🎯 {nickname}님 맞춤 추천 세트</h2>
            {/* ⓘ + 말풍선. 말풍선은 본문 위에 겹쳐 뜬다(레이아웃을 밀지 않는다). */}
            <div ref={infoRef} className="relative">
              <button
                type="button"
                onClick={() => setInfoOpen((v) => !v)}
                aria-expanded={infoOpen}
                aria-label="어떤 기준으로 추천했나요"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-20 text-[11px] font-bold text-gray-50 active:scale-90 transition-transform"
              >
                i
              </button>
              {infoOpen && (
                <div
                  role="tooltip"
                  className="absolute left-1/2 top-full z-10 mt-2 w-[240px] -translate-x-1/2 rounded-xl bg-[#17171C] px-3 py-2.5 text-[12px] leading-relaxed text-white shadow-lg"
                >
                  {/* 말풍선 꼬리 */}
                  <span
                    aria-hidden
                    className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#17171C]"
                  />
                  {budget
                    ? `화장대에 설정한 예산(${manwon(budget.min)} ~ ${manwon(budget.max)})을 기준으로 추천한 세트예요.`
                    : '화장대에 설정한 예산을 기준으로 추천해요. 아직 예산을 정하지 않았어요.'}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/closet');
                    }}
                    className="mt-1 block font-bold text-[#7BE0B8] underline underline-offset-2"
                  >
                    화장대에서 예산 바꾸기
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="text-[11px] text-oy-sub">토너·에센스·크림·선크림 루틴을 짜 드려요</p>
            {/* 지금 고른 안(알뜰·균형·여유)을 담는다 */}
            {active && combos.length > 0 && budget !== null && (
              <button
                type="button"
                onClick={() => onAddAll(active.items.map((i) => i.product))}
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold text-white transition-transform active:scale-95"
                style={{ background: '#00916D' }}
              >
                장바구니 담기
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto px-4 pb-2">
          {budgetLoading ? null : budget === null ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-oy-sub">화장대에서 예산을 정하면 루틴을 짜 드려요</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/closet');
                }}
                className="mt-3 rounded-full px-4 py-2 text-[12px] font-bold text-white transition-transform active:scale-95"
                style={{ background: '#00916D' }}
              >
                예산 정하러 가기
              </button>
            </div>
          ) : guide.error ? (
            <div className="py-8 text-center">
              <p className="text-[13px] text-oy-sub">{guide.error}</p>
              <button
                type="button"
                onClick={guide.reload}
                className="mt-3 rounded-full border border-oy-text/20 px-4 py-1.5 text-[13px] font-medium transition-transform active:scale-95"
              >
                다시 시도
              </button>
            </div>
          ) : guide.loading ? (
            <div className="mt-4 animate-pulse space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-16 rounded-xl bg-oy-line" />
              ))}
            </div>
          ) : combos.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px] font-semibold text-oy-text">이 예산으로는 루틴을 짤 수 없어요</p>
              {guide.data?.minPossibleTotal != null && (
                <p className="mt-1 text-[12px] text-oy-sub">
                  최소 {won(guide.data.minPossibleTotal)}이 필요해요. 화장대에서 예산을 늘려 보세요
                </p>
              )}
            </div>
          ) : (
            <>
              {active && (
                <>
                  {/* 1~3안 — 조합 합계와 평균 별점 */}
                  <div className="mt-4 flex gap-2">
                    {combos.map((c, i) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setTab(i)}
                        className={`flex-1 rounded-xl border px-2 py-2 text-left transition-colors ${
                          active === c ? 'border-primary bg-primary-light' : 'border-gray-10 bg-white'
                        }`}
                      >
                        <span className="block text-[11px] font-bold text-gray-50">{c.label}</span>
                        <span className="block text-[13px] font-extrabold text-oy-text">
                          {won(c.total)}
                        </span>
                        {c.averageRating != null && (
                          <span className="block text-[11px] text-gray-50">★ 평균 {c.averageRating.toFixed(1)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {(guide.data?.missingSteps.length ?? 0) > 0 && (
                    <p className="mt-2 rounded-xl bg-[#FFF7EA] px-3 py-2 text-[12px] leading-relaxed text-[#8A5A00]">
                      예산에 맞춰 {guide.data!.missingSteps.join('·')}은(는) 뺐어요.
                      {guide.data!.minPossibleTotal != null &&
                        ` 네 단계를 다 담으려면 최소 ${won(guide.data!.minPossibleTotal)}이 필요해요.`}
                    </p>
                  )}
                  {active.belowRange && (
                    <p className="mt-2 text-[11px] text-oy-sub">예산 범위 안의 조합이 없어 더 저렴한 조합을 골랐어요</p>
                  )}
                  <ul className="mt-2 divide-y divide-surface-warm">
                    {active.items.map((it) => (
                      <li key={it.step}>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            navigate(`/detail/${it.product.id}`);
                          }}
                          className="flex w-full items-center gap-3 py-2.5 text-left"
                        >
                          <span className="w-12 shrink-0 text-[11px] font-bold text-primary-dark">{it.stepLabel}</span>
                          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-oy-line">
                            {it.product.imageUrl && (
                              <img src={it.product.imageUrl} alt="" className="h-full w-full object-cover" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-bold text-oy-sub">{it.product.brand}</span>
                            <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-oy-text">
                              {it.product.name}
                            </span>
                          </span>
                          <span className="shrink-0 text-[12px] font-extrabold text-oy-text">
                            {won(it.product.price)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {/* 추천 사유 — 목록 아래에 둔다 */}
                  <p className="mt-2 rounded-xl bg-gray-5 px-3 py-2 text-[12px] leading-relaxed text-gray-70">
                    {active.reason}
                  </p>
                </>
              )}
            </>
          )}
        </div>

      </div>
    </>
  );
}
