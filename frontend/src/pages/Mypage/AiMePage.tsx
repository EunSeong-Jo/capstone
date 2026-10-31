import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { TasteCard } from '../../components/mypage/TasteCard';
import { AiMemoryPanel } from './AiMemoryPage';

/** 마이 > AI가 기억하는 나 — 후기·찜·화장대에서 배운 내 취향 성분과, 챗봇이 기억하는 정보(보기·수정·끄기·삭제). */
export default function AiMePage() {
  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="AI가 기억하는 나" />
      <div className="px-4 pb-10 pt-1">
        <div className="rounded-2xl bg-white px-5 py-4">
          <TasteCard />
          <hr className="my-4 border-gray-10" />
          <AiMemoryPanel />
        </div>
      </div>
    </PageWrapper>
  );
}
