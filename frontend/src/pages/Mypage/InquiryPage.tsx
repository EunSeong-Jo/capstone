import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';
import { SupportContactBar } from '../../components/mypage/SupportContactBar';

type InquiryTab = '문의하기' | '문의내역';

const inquiryTypes = [
  { emoji: '📦', label: '배송 문의' },
  { emoji: '↩️', label: '취소/교환/환불' },
  { emoji: '🌿', label: '성분 문의' },
  { emoji: '💊', label: '단종상품 문의' },
  { emoji: '💳', label: '결제/적립금' },
  { emoji: '👤', label: '회원정보' },
  { emoji: '🤖', label: 'AI 추천 문의' },
  { emoji: '💬', label: '기타' },
];

const periodOptions = ['1개월간 문의내역', '3개월간 문의내역', '6개월간 문의내역', '1년간 문의내역'];

const historyItems = [
  {
    id: 1,
    type: '배송 문의',
    title: '이니스프리 토너 배송이 너무 늦어요',
    date: '2026.05.28',
    status: '답변완료',
    statusClass: 'text-primary',
    answer: '안녕하세요, 대체뭐야 고객센터입니다. 배송 지연에 불편을 드려 죄송합니다. 확인 결과 택배사 사정으로 1-2일 지연되었으며, 2026.05.30에 도착 예정입니다.',
  },
  {
    id: 2,
    type: '성분 문의',
    title: '이 성분이 민감성 피부에 맞나요?',
    date: '2026.06.10',
    status: '답변대기',
    statusClass: 'text-orange-500',
    answer: null,
  },
];

export default function InquiryPage() {
  const [tab, setTab] = useState<InquiryTab>('문의하기');
  const [period, setPeriod] = useState(periodOptions[0]);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [inquiryText, setInquiryText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!selectedType || inquiryText.trim().length < 10) return;
    setSubmitted(true);
    setTimeout(() => {
      setTab('문의내역');
      setSubmitted(false);
      setSelectedType(null);
      setInquiryText('');
    }, 1500);
  };

  return (
    <PageWrapper>
      <Header showBack title="1:1 문의" />

      <div className="flex border-b border-gray-20">
        {(['문의하기', '문의내역'] as InquiryTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3.5 text-[15px] font-bold border-b-2 ${
              tab === t ? 'text-gray-100 border-gray-100' : 'text-gray-50 border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === '문의하기' && (
        <div className="flex-1 px-4 pt-5 pb-8">
          {submitted ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <span className="text-5xl">✅</span>
              <p className="text-base font-bold text-gray-100">문의가 접수되었습니다!</p>
              <p className="text-[13px] text-gray-50">빠르게 답변 드릴게요.</p>
            </div>
          ) : (
            <>
              <p className="text-[15px] font-bold text-gray-100 mb-3.5">문의 유형 선택</p>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {inquiryTypes.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setSelectedType(t.label)}
                    className={`flex items-center gap-2 px-2 py-3.5 rounded-xl ${
                      selectedType === t.label ? 'border-2 border-primary bg-primary-light' : 'border-[1.5px] border-gray-20 bg-white'
                    }`}
                  >
                    <span className="text-xl">{t.emoji}</span>
                    <span className={`text-[13px] ${selectedType === t.label ? 'font-bold text-primary' : 'font-medium text-gray-70'}`}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>

              <p className="text-[15px] font-bold text-gray-100 mb-2.5">문의 내용</p>
              <textarea
                value={inquiryText}
                onChange={(e) => setInquiryText(e.target.value)}
                placeholder={'문의하실 내용을 자세히 작성해 주세요.\n(최소 10자 이상)'}
                className="w-full h-[140px] p-3.5 rounded-xl border-[1.5px] border-gray-20 text-[13px] text-gray-100 leading-relaxed resize-none outline-none bg-gray-5 box-border"
              />
              <p className="text-[11px] text-gray-50 text-right mt-1 mb-5">{inquiryText.length} / 1000</p>

              <button
                onClick={handleSubmit}
                className={`w-full py-4 rounded-xl text-[15px] font-bold text-white transition-colors ${
                  selectedType && inquiryText.length >= 10 ? 'bg-primary' : 'bg-gray-20'
                }`}
              >
                문의 접수하기
              </button>
              <p className="text-xs text-gray-50 text-center mt-3">· 평일 09:00 ~ 18:00 내 순차적으로 답변 드립니다.</p>
            </>
          )}
        </div>
      )}

      {tab === '문의내역' && (
        <div className="flex-1 flex flex-col">
          <div className="px-4 pt-4 relative">
            <button
              onClick={() => setPeriodOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg border-[1.5px] border-gray-20 text-sm text-gray-100"
            >
              {period}
              <Icon name="keyboard_arrow_down" size={16} className={`text-gray-70 transition-transform ${periodOpen ? 'rotate-180' : ''}`} />
            </button>
            {periodOpen && (
              <div className="absolute top-full left-4 right-4 bg-white rounded-xl shadow-lg z-20 overflow-hidden">
                {periodOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setPeriod(opt); setPeriodOpen(false); }}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-10 ${opt === period ? 'font-bold text-primary' : 'text-gray-100'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-50 mt-2 pl-0.5">· 1년 이전 내역은 PC버전에서 확인해주세요.</p>
          </div>

          <div className="h-px bg-gray-10 mt-3" />

          <div className="flex-1">
            {historyItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <span className="w-16 h-16 rounded-full border-2 border-gray-20 flex items-center justify-center text-2xl font-bold text-gray-20">!</span>
                <p className="text-sm text-gray-50">문의내역이 없습니다.</p>
              </div>
            ) : (
              historyItems.map((item) => (
                <div key={item.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="w-full text-left px-4 py-4 border-b border-gray-10"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-10 text-gray-70">{item.type}</span>
                      <span className={`text-xs font-bold ${item.statusClass}`}>{item.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-100 leading-snug mb-1">{item.title}</p>
                    <p className="text-xs text-gray-50">{item.date}</p>
                  </button>
                  {expandedId === item.id && item.answer && (
                    <div className="px-4 py-3.5 bg-primary-light/40 border-b border-gray-10">
                      <p className="text-xs font-bold text-primary mb-2">💬 답변</p>
                      <p className="text-[13px] text-gray-70 leading-relaxed">{item.answer}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <SupportContactBar />
    </PageWrapper>
  );
}
