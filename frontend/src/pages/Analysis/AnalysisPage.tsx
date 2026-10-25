import { useNavigate, useParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { AnalysisView } from '../../components/analysis/AnalysisView';
import { skinTypes } from '../../data/skinTypes';
import { useProductAnalysis } from '../../hooks/useProductAnalysis';
import { useSkinType } from '../../hooks/useSkinType';
import { useCloset } from '../../context/closet';

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 px-4 py-5">
      <div className="h-24 rounded-xl bg-oy-chip" />
      <div className="h-40 rounded-xl bg-oy-chip" />
      <div className="h-24 rounded-xl bg-oy-chip" />
    </div>
  );
}

/**
 * 성분 분석 — 어느 제품이든 상세 페이지·화장대에서 들어오는 "성분 리포트"(`/analysis/:id`).
 *
 * 제품 상세가 상품 정보(가격·리뷰·구매)라면 여기는 해석이다: 이 제품이 어떤 기능에 강한지, 핵심 성분은 무엇인지,
 * 조심할 성분은 무엇인지, 전성분의 구성, 그리고 내 화장대의 다른 제품과 견주었을 때 겹치는 기능과 비어 있는 기능.
 * 가격·리뷰·장바구니는 두지 않는다.
 */
export default function AnalysisPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const productId = Number(id);
  const { analysis, stateSource, photoAt, photo, reloadPhoto, loading, notFound, error, reload } =
    useProductAnalysis(productId);
  const { skinType } = useSkinType();
  const { hasItem } = useCloset();
  const typeLabel = skinTypes.find((t) => t.id === skinType)?.label;

  if (notFound) {
    return (
      <PageWrapper>
        <Header showBack title="성분 분석" />
        <p className="px-4 py-16 text-center text-sm text-oy-sub">제품을 찾을 수 없어요.</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Header showBack title="성분 분석" />
      {loading && !analysis && <Skeleton />}
      {error && !analysis && (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-oy-sub">분석을 불러오지 못했어요.</p>
          <button type="button" onClick={reload} className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
            다시 시도
          </button>
        </div>
      )}

      {analysis && (
        <AnalysisView
          analysis={analysis}
          typeLabel={typeLabel}
          skinType={skinType}
          stateSource={stateSource}
          photoAt={photoAt}
          photo={photo}
          onReloadPhoto={reloadPhoto}
          navigate={navigate}
          owned={hasItem(productId)}
        />
      )}
    </PageWrapper>
  );
}
