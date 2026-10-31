import { OptionPicker } from '../product/OptionPicker';
import { useMemo } from 'react';
import { useAuth } from '../../context/auth';
import type { ProductAnalysis, CautionKind } from '../../api/analysis';
import type { AnalysisDto } from '../../api/skinPhoto';
import type { SkinStateSource } from '../../hooks/useSkinStateSource';
import { FunctionBars } from './FunctionBars';
import { IngredientBand } from './IngredientBand';
import { ConcernStateSection } from './ConcernStateSection';
import { PhotoCta } from './PhotoCta';
import { SkinStateSection } from './SkinStateSection';

const VERDICT = {
  good: { title: '내 피부에 잘 맞아요', box: 'border-good-line bg-good-soft', badge: 'bg-good-soft text-good' },
  ok: { title: '무난해요', box: 'border-oy-line bg-white', badge: 'bg-oy-chip text-oy-sub' },
  caution: { title: '내 피부엔 주의가 필요해요', box: 'border-caution-line bg-caution-soft', badge: 'bg-caution-soft text-caution' },
  unknown: { title: '판단할 근거가 부족해요', box: 'border-dashed border-oy-line bg-white', badge: 'bg-oy-chip text-oy-sub' },
} as const;

const CAUTION_NOTE: Record<CautionKind, string> = {
  listed: '표시가 의무인 알레르기 유발 착향제예요.',
  fragrance: '향을 내는 성분이에요. 민감하면 자극이 될 수 있어요.',
  alcohol: '휘발성이라 건조함을 키울 수 있어요.',
  irritant: '피부가 예민할 때 자극이 될 수 있어요.',
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-5">
      <h2 className="text-[15px] font-extrabold text-oy-text">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-xs text-oy-sub">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

const Divider = () => <div className="h-2 bg-oy-line" />;


/**
 * 성분 분석 화면의 본문. 데이터를 받아 그리기만 한다(훅·라우터 의존은 페이지가 갖는다).
 * 제품 상세가 상품 정보(가격·리뷰·구매)라면 여기는 해석이다.
 */
export function AnalysisView({
  analysis,
  typeLabel,
  skinType,
  stateSource,
  photoAt,
  photo,
  onReloadPhoto,
  navigate,
  onPickOption,
  owned = false,
}: {
  analysis: ProductAnalysis;
  typeLabel?: string;
  skinType: string | null;
  stateSource: SkinStateSource;
  photoAt: string | null;
  photo: AnalysisDto | null;
  onReloadPhoto: () => void;
  navigate: (to: string) => void;
  /** 옵션형 묶음 제품의 옵션을 바꾼다(해당 옵션의 분석으로 이동). 옵션이 없으면 쓰이지 않는다 */
  onPickOption?: (id: number) => void;
  /** 이 제품이 내 화장대에 있는가 — 화장대 구역의 제목이 달라진다 */
  owned?: boolean;
}) {
  const reloadPhoto = onReloadPhoto;
  const { isUser } = useAuth();
  const focus = useMemo(() => new Set(analysis.focusFunctions ?? []), [analysis]);
  return (
    <>
        <main className="pb-24">
          {/* 1. 요약 */}
          <section className="px-4 py-5">
            <div className="flex items-center gap-3">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-oy-chip">
                {analysis.imageUrl && <img src={analysis.imageUrl} alt="" className="h-full w-full object-cover" />}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-oy-sub">{analysis.brand}</p>
                <h1 className="line-clamp-2 text-[15px] font-bold leading-snug text-oy-text">{analysis.name}</h1>
                <p className="mt-0.5 text-[11px] text-oy-sub">
                  전성분 {analysis.totalCount}개 중 {analysis.labeledCount}개를 분석했어요
                </p>
              </div>
            </div>

            {/* 옵션형 묶음 제품: 옵션마다 전성분이 달라, 고르면 그 옵션의 분석으로 바뀐다 */}
            {analysis.options && analysis.options.length > 1 && onPickOption && (
              <div className="mt-3">
                <OptionPicker options={analysis.options} currentId={analysis.productId} onPick={onPickOption} />
              </div>
            )}

            {analysis.fit ? (
              <div className={`mt-4 rounded-xl border px-4 py-4 ${VERDICT[analysis.fit.verdict].box}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-bold text-oy-text">
                    {VERDICT[analysis.fit.verdict].title}
                  </p>
                  {analysis.fit.score !== null && (
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${VERDICT[analysis.fit.verdict].badge}`}>
                      {analysis.fit.score}점
                    </span>
                  )}
                </div>
                {typeLabel && <p className="mt-1 text-xs text-oy-sub">{typeLabel} 기준</p>}
                {analysis.fit.reasons.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {analysis.fit.reasons.map((r, i) => (
                      <li key={i} className="flex gap-1.5 text-sm leading-snug text-oy-text">
                        <span className={r.kind === 'plus' ? 'text-primary' : 'text-accent'}>{r.kind === 'plus' ? '＋' : '－'}</span>
                        <span>{r.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-oy-line bg-white px-4 py-4 text-center">
                <p className="text-sm text-oy-sub">피부타입 진단을 하면 이 제품이 내 피부에 맞는지 알려드려요.</p>
                <button type="button" onClick={() => navigate('/onboarding')} className="mt-2.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
                  피부타입 진단하러 가기
                </button>
              </div>
            )}
          </section>
          <Divider />

          {/* 2. 내 피부 상태와 견주기 — 최근 AI 사진 분석 우선, 없으면 문답 진단, 둘 다 없으면 촬영을 안내한다.
              막지 않는다: 제품 분석(아래 구역들)은 사진 없이 본다. */}
          <Section
            title="내 피부 상태와 견주면"
            hint={
              analysis.concernState.length > 0
                ? 'AI가 분석한 항목마다 이 제품이 어떻게 도움이 되는지 봤어요'
                : analysis.skinState.length > 0
                  ? '내 피부 진단 결과를 기준으로 이 제품이 어떻게 도움이 되는지 봤어요'
                  : undefined
            }
          >
            {analysis.concernState.length > 0 && photo ? (
              <ConcernStateSection
                state={analysis.concernState}
                photo={photo}
                onSubscribe={() => navigate('/mypage/subscription')}
              />
            ) : analysis.skinState.length > 0 ? (
              <>
                <SkinStateSection
                  state={analysis.skinState}
                  source={stateSource}
                  photoAt={photoAt}
                />
                {stateSource === 'qna' && <PhotoCta compact onDone={reloadPhoto} />}
              </>
            ) : isUser ? (
              <PhotoCta onDone={reloadPhoto} />
            ) : (
              // 비로그인: 사진 분석·진단 결과가 없으니 로그인을 안내한다(비워 두면 제목만 덩그러니 남는다)
              <div className="rounded-xl border border-dashed border-oy-line bg-white px-4 py-5 text-center">
                <p className="text-sm text-oy-sub">로그인하고 피부 진단을 하면 이 제품이 내 피부 상태에 어떤지 견주어 드려요.</p>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white active:scale-95"
                >
                  로그인하기
                </button>
              </div>
            )}
          </Section>
          <Divider />

          {/* 3. 핵심 성분 */}
          <Section
            title="핵심 성분"
            hint={
              analysis.keyIngredients.some((k) => k.recommended)
                ? '앞쪽(많이 들어 있는) 활성 성분이에요 · ★은 내 피부 추천'
                : '앞쪽(많이 들어 있는) 활성 성분이에요'
            }
          >
            {analysis.keyIngredients.length === 0 ? (
              <p className="text-sm text-oy-sub">분류된 활성 성분이 아직 충분하지 않아요.</p>
            ) : (
              <ul className="divide-y divide-oy-line rounded-xl bg-white px-3.5 shadow-sm">
                {analysis.keyIngredients.map((k) => (
                  <li key={k.position} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-oy-sub">{k.position}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-oy-text">
                        {k.name}
                        {k.recommended && <span className="ml-1 text-primary">★</span>}
                      </span>
                      <span className="block text-xs text-oy-sub">{k.functions.join(' · ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Divider />

          {/* 4. 기능별 강도 */}
          <Section title="이 제품이 하는 일" hint={skinType ? '★는 내 피부타입이 중요하게 보는 기능이에요' : '활성·오일 성분이 어떤 기능을 얼마나 내는지 보여 줘요'}>
            <FunctionBars functions={analysis.functions} focus={focus} />
          </Section>
          <Divider />

          {/* 5. 주의 성분 */}
          <Section title="주의 성분" hint="확실하게 분류된 성분만 알려드려요">
            {analysis.cautions.length === 0 ? (
              <p className="rounded-xl bg-good-soft px-4 py-3 text-sm text-good">알려진 주의 성분이 없어요.</p>
            ) : (
              <div className="space-y-3">
                {analysis.cautions.map((g) => (
                  <div
                    key={g.kind}
                    className={`rounded-xl border px-4 py-3 ${g.kind === 'listed' ? 'border-danger-line bg-danger-soft' : 'border-caution-line bg-caution-soft'}`}
                  >
                    <p className={`text-sm font-bold ${g.kind === 'listed' ? 'text-danger' : 'text-caution'}`}>
                      {g.label} · {g.ingredients.length}종
                    </p>
                    <p className="mt-0.5 text-xs text-oy-sub">{CAUTION_NOTE[g.kind]}</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {g.ingredients.map((i) => (
                        <li key={i.position} className="igr-chip warn">
                          {i.name}
                          <span className="ml-1 text-[11px] opacity-70">{i.position}번</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Divider />

          {/* 6. 전성분 해부도 */}
          <Section title="전성분 해부도" hint="적게 들어 있는 성분부터 많은 성분 순서로, 기능별로 색을 칠했어요">
            <IngredientBand anatomy={analysis.anatomy} />
          </Section>
          <Divider />

          {/* 7. 내 화장대에서의 위치 */}
          <Section title={owned ? '내 화장대에서의 위치' : '내 화장대와 견주면'} hint={analysis.closet ? `같은 ${analysis.closet.category} 제품과 견줬어요` : undefined}>
            {!analysis.closet || analysis.closet.ownedCount === 0 ? (
              <p className="text-sm text-oy-sub">
                화장대에 같은 종류의 다른 제품이 없어서 견줄 대상이 없어요. 제품을 더 등록하면 겹치는 기능과 비어 있는 기능을 알려드려요.
              </p>
            ) : (
              <div className="space-y-3">
                {analysis.closet.overlaps.length > 0 && (
                  <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-[13px] font-extrabold text-oy-text">이미 가진 기능이에요</p>
                    <p className="mt-0.5 text-[11px] text-oy-sub">이 제품과 같은 기능을 다른 보유 제품도 강하게 갖고 있어요</p>
                    <ul className="mt-2 space-y-2">
                      {analysis.closet.overlaps.map((o) => (
                        <li key={o.function} className="flex min-w-0 items-start gap-2">
                          <span className="mt-0.5 w-14 shrink-0 rounded-full bg-primary-light py-0.5 text-center text-[11px] font-bold text-primary">
                            {o.name}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                            {o.products.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => navigate(`/analysis/${p.id}`)}
                                className="max-w-full truncate rounded-full border border-oy-line px-2.5 py-1 text-[11px] font-semibold text-oy-text active:scale-95"
                              >
                                {p.name} ›
                              </button>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.closet.gaps.length > 0 && (
                  <div className="rounded-xl border border-dashed border-primary/40 bg-primary-light px-4 py-3">
                    <p className="text-[13px] font-extrabold text-primary">아직 부족한 기능이에요</p>
                    <p className="mt-1 text-[13px] leading-snug text-oy-text">
                      {typeLabel ?? '내 피부타입'}에 중요한{' '}
                      <b>{analysis.closet.gaps.map((g) => g.name).join(', ')}</b> 기능이 이 카테고리 제품들에서 약해요.
                    </p>
                  </div>
                )}
                {analysis.closet.similar.length > 0 && (
                  <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-[13px] font-extrabold text-oy-text">성분이 비슷한 내 제품</p>
                    <ul className="mt-1.5 space-y-1">
                      {analysis.closet.similar.map((s) => (
                        <li key={s.id}>
                          <button type="button" onClick={() => navigate(`/analysis/${s.id}`)} className="flex w-full items-center justify-between gap-2 text-left text-[13px]">
                            <span className="truncate text-oy-text">{s.name}</span>
                            <span className="shrink-0 text-xs font-bold text-primary">{s.percent}%</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.closet.overlaps.length === 0 && analysis.closet.gaps.length === 0 && analysis.closet.similar.length === 0 && (
                  <p className="text-sm text-oy-sub">다른 제품과 크게 겹치지 않아요.</p>
                )}
              </div>
            )}
          </Section>
        </main>

      {/* 8. 다음 행동 */}
      <div
          className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[430px] -translate-x-1/2 gap-2 border-t border-oy-line bg-white px-4 pt-3"
          style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
        >
          <button
            type="button"
            onClick={() => navigate(`/detail/${analysis.productId}`)}
            className="h-[46px] flex-1 rounded-xl border border-oy-line text-sm font-bold text-oy-text active:scale-[.98]"
          >
            상세 보기
          </button>
          <button
            type="button"
            onClick={() => navigate(`/alternatives?seed=${analysis.productId}&from=closet`)}
            className="h-[46px] flex-[1.6] rounded-xl bg-primary text-sm font-bold text-white active:scale-[.98]"
          >
            비슷한 대체품 보기
          </button>
        </div>
    </>
  );
}
