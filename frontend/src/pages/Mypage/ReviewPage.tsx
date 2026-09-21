import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';
import { ReviewWriteSheet, ReviewDraft } from '../../components/reviews/ReviewWriteSheet';
import { useExperience } from '../../context/ExperienceContext';
import { useToast } from '../../components/ui/ToastContext';

type MainTab = '작성 가능한 후기' | '작성한 후기' | '체험단 신청';
type SubTab = '온라인 구매' | '오프라인 구매';

interface WritableItem {
  id: number;
  maxPoint: number;
  brand: string;
  name: string;
  option: string;
  date: string;
  bg: string;
  emoji: string;
}

interface WrittenItem extends ReviewDraft {
  id: number;
  brand: string;
  name: string;
  option: string;
  date: string;
  bg: string;
  emoji: string;
  reviewDate: string;
}

const initialWritable: WritableItem[] = [
  { id: 1, maxPoint: 500, brand: '이니스프리', name: '수분 밸런싱 토너 200ml', option: '기본 · 200ml', date: '2026.06.05 구매확정', bg: 'bg-primary-light', emoji: '🧴' },
  { id: 2, maxPoint: 800, brand: '닥터자르트', name: '세라마이드 수분 크림 60ml', option: '기본 · 60ml', date: '2026.06.05 구매확정', bg: 'bg-rose-100', emoji: '🫙' },
  { id: 3, maxPoint: 400, brand: '코스알엑스', name: '히알루론산 에센스 50ml', option: '기본 · 50ml', date: '2026.05.28 구매확정', bg: 'bg-sky-100', emoji: '💧' },
  { id: 4, maxPoint: 600, brand: '마녀공장', name: '순식물성 클렌징 오일 200ml', option: '기본 · 200ml', date: '2026.05.28 구매확정', bg: 'bg-yellow-50', emoji: '🫧' },
];

const initialWritten: WrittenItem[] = [
  { id: 101, brand: '라운드랩', name: '독도 토너 200ml', option: '기본 · 200ml', date: '2026.03.15 구매확정', bg: 'bg-primary-light', emoji: '🧴', rating: 5, reviewDate: '2026.03.20', text: '흡수도 빠르고 향도 없어서 매일 쓰기 좋아요.', photos: [] },
  { id: 102, brand: '아토팜', name: 'MLE 크림 65ml', option: '기본 · 65ml', date: '2026.03.01 구매확정', bg: 'bg-sky-100', emoji: '🫙', rating: 4, reviewDate: '2026.03.08', text: '보습력은 좋은데 조금 무거운 느낌이 있어요.', photos: [] },
];

function StarRating({ rating }: { rating: number }) {
  return <span className="text-xs tracking-wide">{'⭐'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>;
}

const today = () => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '');

export default function ReviewPage() {
  const { addExp } = useExperience();
  const { showToast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>('작성 가능한 후기');
  const [subTab, setSubTab] = useState<SubTab>('온라인 구매');
  const mainTabs: MainTab[] = ['작성 가능한 후기', '작성한 후기', '체험단 신청'];

  const [writable, setWritable] = useState<WritableItem[]>(initialWritable);
  const [written, setWritten] = useState<WrittenItem[]>(initialWritten);

  const [writeTarget, setWriteTarget] = useState<{ item: WritableItem; styleMode: boolean } | null>(null);
  const [editTarget, setEditTarget] = useState<WrittenItem | null>(null);

  // 적립가능 금액 = "작성 가능한 후기" 목록에 남아있는 상품들의 최대적립금 합.
  // 새 구매가 이 목록에 더해지면 자동으로 늘고, 후기를 쓰면 그만큼 줄어든다.
  const totalPoint = writable.reduce((sum, i) => sum + i.maxPoint, 0);

  const submitNewReview = (draft: ReviewDraft) => {
    if (!writeTarget) return;
    const { item } = writeTarget;
    setWritten((prev) => [
      { id: item.id, brand: item.brand, name: item.name, option: item.option, date: item.date, bg: item.bg, emoji: item.emoji, reviewDate: today(), ...draft },
      ...prev,
    ]);
    setWritable((prev) => prev.filter((i) => i.id !== item.id));
    setWriteTarget(null);
    addExp(20);
    showToast('후기 작성 완료! +20 EXP');
  };

  const submitEditReview = (draft: ReviewDraft) => {
    if (!editTarget) return;
    setWritten((prev) => prev.map((r) => (r.id === editTarget.id ? { ...r, ...draft } : r)));
    setEditTarget(null);
  };

  return (
    <PageWrapper>
      <Header showBack title="후기" />

      <div className="flex-1">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-base font-semibold text-gray-100">적립가능 금액</span>
            <span className="text-xl font-extrabold text-sky-600">{totalPoint.toLocaleString()}원</span>
          </div>
          <span className="text-[13px] text-gray-50">나의 후기 {written.length}개 · 도움돼요 0개</span>
        </div>

        <div className="px-4 pb-4">
          <button className="w-full flex items-center justify-between px-4 py-3.5 rounded-[10px] border-[1.5px] border-gray-20">
            <span className="text-sm font-bold text-gray-100">100만원 적립금의 후기왕에 도전해보세요!</span>
            <Icon name="arrow_forward_ios" size={16} className="text-gray-50" />
          </button>
        </div>

        <div className="flex items-end gap-5 border-b border-gray-20 px-4">
          {mainTabs.map((t) => (
            <div key={t} className="relative pb-2.5">
              <button
                onClick={() => setMainTab(t)}
                className={`flex items-center gap-1 text-sm font-bold whitespace-nowrap ${mainTab === t ? 'text-gray-100' : 'text-gray-50'}`}
              >
                {t}
                {t === '작성 가능한 후기' && <span> {writable.length}</span>}
                {t === '작성한 후기' && <span> {written.length}</span>}
              </button>
              {mainTab === t && <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-gray-100" />}
            </div>
          ))}
        </div>

        <div className="flex bg-gray-5 border-b border-gray-20">
          {(['온라인 구매', '오프라인 구매'] as SubTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-5 py-2.5 text-[13px] border-b-2 ${
                subTab === t ? 'font-bold text-gray-100 border-gray-100 bg-white' : 'text-gray-50 border-transparent'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {mainTab === '작성 가능한 후기' &&
          (writable.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-50">
              <span className="text-3xl">✅</span>
              <p className="text-sm">작성 가능한 후기를 모두 작성했어요.</p>
            </div>
          ) : (
            writable.map((item) => (
              <div key={item.id} className="border-b border-gray-10">
                <div className="flex gap-3 px-4 pt-4 pb-2.5">
                  <div className={`w-20 h-20 rounded-[10px] flex items-center justify-center text-4xl border border-gray-10 shrink-0 ${item.bg}`}>
                    {item.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[11px] text-gray-50">최대적립금</span>
                      <span className="text-[13px] font-bold text-sky-600">{item.maxPoint.toLocaleString()}원</span>
                    </div>
                    <p className="text-xs text-gray-50 mb-0.5">{item.brand}</p>
                    <p className="text-[13px] font-semibold text-gray-100 leading-snug mb-1 line-clamp-2">{item.name}</p>
                    <p className="text-[11px] text-gray-50">{item.option} | {item.date}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                  <button
                    onClick={() => setWriteTarget({ item, styleMode: false })}
                    className="py-2.5 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-100"
                  >
                    후기 작성
                  </button>
                  <button
                    onClick={() => setWriteTarget({ item, styleMode: true })}
                    className="py-2.5 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-100"
                  >
                    스타일 후기 작성
                  </button>
                </div>
              </div>
            ))
          ))}

        {mainTab === '작성한 후기' &&
          written.map((item) => (
            <div key={item.id} className="border-b border-gray-10">
              <div className="flex gap-3 px-4 pt-4 pb-2.5">
                <div className={`w-20 h-20 rounded-[10px] flex items-center justify-center text-4xl border border-gray-10 shrink-0 ${item.bg}`}>
                  {item.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <StarRating rating={item.rating} />
                    <span className="text-[11px] text-gray-50 ml-1">{item.reviewDate} 작성</span>
                  </div>
                  <p className="text-xs text-gray-50 mb-0.5">{item.brand}</p>
                  <p className="text-[13px] font-semibold text-gray-100 leading-snug mb-1">{item.name}</p>
                  <p className="text-[11px] text-gray-50">{item.option} | {item.date}</p>
                </div>
              </div>
              {item.text && <p className="px-4 pb-2.5 text-[13px] leading-relaxed text-gray-70">{item.text}</p>}
              <div className="px-4 pb-4">
                <button
                  onClick={() => setEditTarget(item)}
                  className="w-full py-2.5 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-100"
                >
                  후기 수정
                </button>
              </div>
            </div>
          ))}

        {mainTab === '체험단 신청' && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-50">
            <span className="text-3xl">📝</span>
            <p className="text-sm">진행 중인 체험단이 없습니다.</p>
          </div>
        )}
      </div>

      <ReviewWriteSheet
        open={writeTarget != null}
        onClose={() => setWriteTarget(null)}
        onSubmit={submitNewReview}
        styleMode={writeTarget?.styleMode}
        productLabel={writeTarget ? `${writeTarget.item.brand} · ${writeTarget.item.name}` : undefined}
      />
      <ReviewWriteSheet
        open={editTarget != null}
        onClose={() => setEditTarget(null)}
        onSubmit={submitEditReview}
        initial={editTarget ?? undefined}
        productLabel={editTarget ? `${editTarget.brand} · ${editTarget.name}` : undefined}
      />
    </PageWrapper>
  );
}
