import { Fragment, useEffect, useRef, useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { sendChatMessage } from '../../api/chat';
import { ApiError } from '../../api/client';

/**
 * AI 챗봇 UI — backend POST /api/v1/chat(RAG) 연동.
 * quickButtons(고객센터 FAQ)는 기존 정형 응답을 그대로 유지합니다 — AI 챗봇과는 별개 기능입니다.
 * TODO: 사용자 피부타입/날씨 정보 연동은 별도 작업으로 진행 예정. 지금은 skin_type 미전달.
 */

interface Message {
  id: number;
  role: 'bot' | 'user';
  text?: string;
  isWelcome?: boolean;
  isButtons?: boolean;
}

const quickButtons = [
  ['온라인몰 주문내역 문의', '이벤트'],
  ['온라인몰 주문 전 문의', '결제/영수증'],
  ['쿠폰/포인트/기프트카드', '멤버십/회원정보'],
  ['단종상품 문의', 'FAQ/공지사항'],
  ['성분 분석 문의', 'Swappy머니'],
  ['배송 문의', '취소/교환/반품'],
];

function BotAvatar() {
  return (
    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg shrink-0 shadow">
      🤖
    </div>
  );
}

export default function ChatSupportPage() {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'bot', isWelcome: true },
    { id: 2, role: 'bot', isButtons: true },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(3);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || isSending) return;

    const userText = inputText;
    const userMsg: Message = { id: nextId.current++, role: 'user', text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    // 서버에 보낼 대화 히스토리 (welcome/버튼 안내 메시지는 제외)
    const history = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role === 'bot' ? ('assistant' as const) : ('user' as const), content: m.text! }));

    try {
      const { reply } = await sendChatMessage({ message: userText, history });
      const botReply: Message = { id: nextId.current++, role: 'bot', text: reply };
      setMessages((prev) => [...prev, botReply]);
    } catch (err) {
      // 백엔드 detail은 이미 사용자에게 보여줄 수 있게 다듬어진 문구다
      // (내부 예외 텍스트는 서버 로그에만 남고 여기까지 오지 않는다).
      const text =
        err instanceof ApiError ? err.message : '죄송해요, 답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.';
      const botReply: Message = { id: nextId.current++, role: 'bot', text };
      setMessages((prev) => [...prev, botReply]);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickBtn = (label: string) => {
    const userMsg: Message = { id: nextId.current++, role: 'user', text: label };
    const botReply: Message = {
      id: nextId.current++,
      role: 'bot',
      text: `'${label}'에 대한 문의를 접수했습니다.\n담당자가 빠르게 확인 후 답변 드릴게요! 🙏`,
    };
    setMessages((prev) => [...prev, userMsg, botReply]);
  };

  return (
    <PageWrapper>
      <Header showBack title="채팅 상담" />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex justify-center mb-5">
          <span className="text-xs text-gray-70 bg-black/[.08] px-3.5 py-1.5 rounded-full">2026년 6월 25일</span>
        </div>

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'bot' && (
              <div className="flex gap-2 mb-3 items-start">
                <BotAvatar />
                <div className="flex-1 max-w-[80%]">
                  <span className="text-[11px] text-gray-50 mb-1 block">swappy · 방금 전</span>

                  {msg.isWelcome && (
                    <>
                      <div className="bg-gray-100 rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl px-5 pt-4 pb-2 mb-2 text-center">
                        <span className="text-4xl">🤖</span>
                      </div>
                      <div className="bg-white rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl px-4 py-3.5 shadow-sm text-[13px] text-gray-100 leading-relaxed">
                        반갑습니다.
                        <br />
                        저는 고객님의 궁금증을 해결해 드릴 swappy 챗봇이에요.
                        <br />
                        <br />
                        ⭐ <strong>대화 TIP</strong>
                        <br />
                        ✔ 문장보다 키워드를 더 잘 이해해요.
                        <br />
                        ex) 배송 지연, 단종상품, 교환, 반품 등
                        <br />
                        <br />
                        ✔ 상품명을 잘 이해할 수 없어요. 상품명을 빼고 질문해 주세요.
                        <br />
                        ex) 토너 주문했는데 언제와? → 배송 일정
                        <br />
                        <br />
                        ⭐ 현재 문의량이 많아 상담이 일부 지연될 수 있어요 🙏
                      </div>
                    </>
                  )}

                  {msg.isButtons && (
                    <div className="bg-white rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl p-3 mt-1 shadow-sm">
                      <div className="grid grid-cols-2 gap-1.5">
                        {quickButtons.map(([left, right]) => (
                          <Fragment key={left}>
                            <button
                              onClick={() => handleQuickBtn(left)}
                              className="py-2.5 px-2 rounded-lg border border-gray-20 text-xs text-gray-100 text-center leading-snug"
                            >
                              {left}
                            </button>
                            <button
                              onClick={() => handleQuickBtn(right)}
                              className="py-2.5 px-2 rounded-lg border border-gray-20 text-xs text-gray-100 text-center leading-snug"
                            >
                              {right}
                            </button>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.text && (
                    <div className="bg-white rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl px-3.5 py-3 shadow-sm text-[13px] text-gray-100 leading-relaxed whitespace-pre-line">
                      {msg.text}
                    </div>
                  )}
                </div>
              </div>
            )}

            {msg.role === 'user' && msg.text && (
              <div className="flex justify-end mb-3">
                <div className="bg-primary rounded-tl-2xl rounded-tr-[4px] rounded-b-2xl px-3.5 py-2.5 max-w-[72%] text-[13px] text-white leading-relaxed whitespace-pre-line">
                  {msg.text}
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t border-gray-20 px-3 py-2.5 flex items-center gap-2" style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}>
        <button className="w-[34px] h-[34px] rounded-full border-[1.5px] border-gray-20 flex items-center justify-center shrink-0 text-gray-70">
          +
        </button>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          disabled={isSending}
          placeholder={isSending ? '답변을 기다리는 중...' : '버튼을 선택하거나 메시지를 입력하세요'}
          className="flex-1 border border-gray-20 rounded-full px-3.5 py-2.5 text-[13px] text-gray-100 bg-gray-5 outline-none disabled:opacity-60"
        />
        <button
          onClick={sendMessage}
          disabled={isSending}
          className={`w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 transition-colors ${
            inputText.trim() && !isSending ? 'bg-primary' : 'bg-gray-20'
          }`}
          aria-label="전송"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M4 12L20 4L14 20L11 13L4 12Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </PageWrapper>
  );
}
