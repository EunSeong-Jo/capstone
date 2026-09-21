import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';

const categories = [
  { label: '회원/멤버십', emoji: '👤' },
  { label: '주문/결제', emoji: '💳' },
  { label: '배송문의', emoji: '🚚' },
  { label: '취소/교환/환불', emoji: '↩️' },
  { label: '이벤트', emoji: '🎉' },
  { label: '사이트이용 오류/개선', emoji: '⚙️' },
];

const keywords = ['#성분분석', '#단종상품', '#대체제추천', '#배송', '#교환', '#반품', '#적립금', '#쿠폰'];

const faqQuestions = [
  '피부타입 재진단은 어떻게 하나요?',
  '닉네임과 이메일을 변경하고 싶어요.',
  '회원 탈퇴하면 데이터는 어떻게 되나요?',
  '사용할 수 있는 결제 수단은 무엇인가요?',
  '적립금은 언제 지급되고 어떻게 쓰나요?',
  '현금영수증·세금계산서 발급이 되나요?',
  '배송은 보통 얼마나 걸리나요?',
  '배송비는 얼마이고 무료 조건이 있나요?',
  '주문한 상품이 안 왔어요.',
  '주문을 취소하고 싶어요.',
  '단순 변심으로 교환·환불이 되나요?',
  '불량·오배송 상품을 받았어요.',
  '이벤트 당첨자 발표는 어디서 확인하나요?',
  '성분 챌린지·후기 이벤트 참여 조건이 궁금해요.',
  '성분 분석 결과가 안 나와요 / 화면이 멈춰요.',
  '찾는 제품이 없거나 대체품 추천이 부정확해요.',
];

export default function CustomerServicePage() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState('온라인몰');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const types = ['온라인몰', '오늘드림'];

  const searchMatches = searchText.trim()
    ? faqQuestions.filter((q) => q.includes(searchText.trim()))
    : [];

  return (
    <PageWrapper>
      <Header showBack title="고객센터" />

      <div className="flex-1">
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-extrabold text-gray-100">FAQ</span>
            <button className="flex items-center gap-0.5 text-[13px] text-gray-50">
              전체보기 <Icon name="arrow_forward_ios" size={14} className="text-gray-50" />
            </button>
          </div>

          <div className="relative mb-5">
            <div className="flex items-center gap-2.5 border-[1.5px] border-gray-20 rounded-full px-4 py-2.5">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="질문 키워드를 입력해 주세요."
                className="flex-1 outline-none text-sm text-gray-100 placeholder:text-gray-50 bg-transparent"
              />
              <Icon name="search" size={18} className="text-gray-50" />
            </div>
            {searchText.trim() && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-gray-20 bg-white shadow-lg">
                {searchMatches.length === 0 ? (
                  <p className="px-4 py-3.5 text-sm text-gray-50">일치하는 질문이 없어요.</p>
                ) : (
                  searchMatches.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setExpandedQ(q);
                        setSearchText('');
                      }}
                      className="block w-full border-b border-gray-10 px-4 py-3 text-left text-sm text-gray-100 last:border-0 active:bg-gray-5"
                    >
                      <span className="font-bold text-gray-50 mr-1.5">Q</span>
                      {q}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button className="flex items-center gap-2 w-full mb-5 bg-accent-light rounded-xl px-3.5 py-2.5 border border-accent/30">
            <span className="text-2xl shrink-0">💬</span>
            <span className="flex-1 text-left text-sm font-bold text-accent">가장 궁금해하시는 질문 7개</span>
            <Icon name="arrow_forward_ios" size={14} className="text-accent" />
          </button>

          <div className="flex justify-center gap-7 mb-5">
            {types.map((t) => (
              <button key={t} onClick={() => setSelectedType(t)} className="flex flex-col items-center gap-2">
                <span
                  className={`w-16 h-16 rounded-[20px] flex items-center justify-center text-2xl ${
                    selectedType === t ? 'bg-gray-100' : 'bg-gray-10'
                  }`}
                >
                  {t === '온라인몰' ? '🛒' : '📦'}
                </span>
                <span className={`text-xs ${selectedType === t ? 'font-bold text-gray-100' : 'text-gray-50'}`}>{t}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 border-t border-l border-gray-10">
          {categories.map((cat) => (
            <button
              key={cat.label}
              className="flex flex-col items-center gap-1.5 py-[18px] border-r border-b border-gray-10 px-2"
            >
              <span className="text-2xl">{cat.emoji}</span>
              <span className="text-xs text-gray-70 text-center leading-tight whitespace-pre-line">{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-base font-extrabold text-gray-100">전체 질문</span>
            <span className="text-sm text-gray-50">{faqQuestions.length}건</span>
          </div>
          <div className="mb-1">
            {faqQuestions.map((q) => {
              const open = expandedQ === q;
              return (
                <div key={q} className="border-b border-gray-10 last:border-0">
                  <button
                    onClick={() => setExpandedQ(open ? null : q)}
                    className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
                  >
                    <span className="text-sm text-gray-100">
                      <span className="font-bold text-gray-50 mr-1.5">Q</span>
                      {q}
                    </span>
                    <Icon
                      name="keyboard_arrow_down"
                      size={18}
                      className={`shrink-0 text-gray-50 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <p className="pb-3.5 text-[13px] leading-relaxed text-gray-70">
                      <span className="font-bold text-primary mr-1">A</span>
                      자세한 내용은 채팅 상담 또는 1:1 문의를 통해 편하게 물어봐 주세요. 순차적으로 확인 후 답변 드릴게요.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 pt-5">
          <p className="text-base font-extrabold text-gray-100 mb-3.5">인기 키워드</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {keywords.map((kw) => (
              <button key={kw} className="shrink-0 px-3.5 py-2 rounded-full border-[1.5px] border-gray-20 text-[13px] text-gray-70">
                {kw}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-4 mt-5 grid grid-cols-2 border border-gray-10 rounded-2xl overflow-hidden">
          <button
            onClick={() => navigate('/mypage/chat-support')}
            className="flex items-center justify-center gap-2 py-[18px] bg-gray-5 border-r border-gray-10"
          >
            <span className="text-lg">💬</span>
            <span className="text-sm font-semibold text-gray-100">채팅 상담</span>
          </button>
          <button
            onClick={() => navigate('/mypage/inquiry')}
            className="flex items-center justify-center gap-2 py-[18px] bg-gray-5"
          >
            <span className="text-lg">❓</span>
            <span className="text-sm font-semibold text-gray-100">1:1 문의</span>
          </button>
        </div>

        <div className="mx-4 mt-4 p-[18px] rounded-2xl bg-gray-5">
          <p className="text-[13px] text-gray-50 mb-1.5">고객센터</p>
          <p className="text-2xl font-extrabold text-gray-100 mb-2">1577-0000</p>
          <p className="text-xs text-gray-50 mb-0.5">· 일반문의 : 09:00 ~ 18:00 (평일)</p>
          <p className="text-xs text-gray-50">· 성분/단종문의 : 09:00 ~ 22:00 (평일, 주말)</p>
        </div>

        <div className="h-6" />
      </div>
    </PageWrapper>
  );
}
