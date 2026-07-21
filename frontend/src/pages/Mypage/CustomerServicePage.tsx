import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';
import { SupportContactBar } from '../../components/mypage/SupportContactBar';

const categories = [
  { label: '회원/멤버십', emoji: '👤' },
  { label: '주문/결제', emoji: '💳' },
  { label: '배송문의', emoji: '🚚' },
  { label: '취소/교환/환불', emoji: '↩️' },
  { label: '이벤트', emoji: '🎉' },
  { label: '사이트이용 오류/개선', emoji: '⚙️' },
];

const keywords = ['#성분분석', '#단종상품', '#대체제추천', '#배송', '#교환', '#반품', '#적립금', '#쿠폰'];

const notices = [
  { id: 1, tag: '이벤트', date: '2026.06.24', title: '[대체뭐야 이벤트] 6월 베스트 성분 챌린지 당첨자 발표' },
  { id: 2, tag: '이벤트', date: '2026.06.24', title: '[대체뭐야 라이브] 6/16 이니스프리 방송참여 이벤트 당첨자 발표' },
  { id: 3, tag: '일반', date: '2026.06.23', title: '6월 대체뭐야 세일 댓글 이벤트 당첨자 발표 지연 안내' },
  { id: 4, tag: '일반', date: '2026.06.22', title: 'AI 성분 분석 서비스 업데이트 안내' },
  { id: 5, tag: '일반', date: '2026.06.20', title: '개인정보 처리방침 변경 안내' },
];

export default function CustomerServicePage() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState('온라인몰');
  const types = ['온라인몰', '오늘드림'];

  return (
    <PageWrapper>
      <Header showBack title="고객센터" />

      <div className="flex-1">
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-extrabold text-gray-100">FAQ</span>
            <button className="flex items-center gap-0.5 text-[13px] text-gray-50">
              더보기 <Icon name="arrow_forward_ios" size={14} className="text-gray-50" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 border-[1.5px] border-gray-20 rounded-full px-4 py-2.5 mb-3.5">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="질문 키워드를 입력해 주세요."
              className="flex-1 outline-none text-sm text-gray-100 placeholder:text-gray-50 bg-transparent"
            />
            <Icon name="search" size={18} className="text-gray-50" />
          </div>

          <button className="flex items-center gap-2 w-full mb-5 bg-accent-light rounded-xl px-3.5 py-2.5 border border-accent/30">
            <span className="text-2xl shrink-0">💬</span>
            <span className="flex-1 text-left text-sm font-bold text-accent">가장 궁금해하시는 질문 10개</span>
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

        <div className="px-4 pt-6 pb-1">
          <div className="flex items-center justify-between">
            <span className="text-lg font-extrabold text-gray-100">공지사항</span>
            <button className="flex items-center gap-0.5 text-[13px] text-gray-50">
              더보기 <Icon name="arrow_forward_ios" size={14} className="text-gray-50" />
            </button>
          </div>
        </div>

        <div>
          {notices.map((notice) => (
            <button key={notice.id} className="w-full text-left px-4 py-4 border-b border-gray-10">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-10 text-gray-70">{notice.tag}</span>
                <span className="text-xs text-gray-50">{notice.date}</span>
              </div>
              <p className="text-sm text-gray-100 leading-snug">{notice.title}</p>
            </button>
          ))}
        </div>
      </div>

      <SupportContactBar />
    </PageWrapper>
  );
}
