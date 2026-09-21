import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

/** 아직 만들지 않은 기능(예: 화장대 성분 분석)의 자리표시 화면 */
export default function ComingSoonPage() {
  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="성분 분석" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="text-4xl">🔬</span>
        <p className="text-[15px] font-bold text-gray-100">개발 중이에요</p>
        <p className="text-sm text-gray-50 leading-relaxed">
          내 피부타입과 이 제품의 성분을 비교 분석하는 기능을 준비하고 있어요.
          <br />
          조금만 기다려 주세요!
        </p>
      </div>
    </PageWrapper>
  );
}
