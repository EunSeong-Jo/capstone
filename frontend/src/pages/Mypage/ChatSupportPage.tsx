import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { searchProducts } from '../../api/products';
import { sendChatMessage } from '../../api/chat';
import { ApiError } from '../../api/client';
import { useCloset } from '../../context/closet';
import { useAuth } from '../../context/auth';
import { useDiagnosis } from '../../context/diagnosis';
import { useCharacter } from '../../context/character';
import { CharacterAvatar } from '../../components/character/CharacterAvatar';
import type { SkinType } from '../../types';

// Home/index.tsx와 동일한 기본값. 로그인·진단 모두 없는 게스트가 챗봇을 열면
// 여기 폴백이 없어서 skinType이 undefined로 넘어가 "미확인"으로 표시되던 버그가 있었다 —
// 앱 다른 화면과 동작을 맞춘다.
const DEFAULT_SKIN: SkinType = 'ondalsam';

/**
 * AI 챗봇 UI — backend POST /api/v1/chat(RAG) 연동.
 * quickButtons(고객센터 FAQ)는 기존 정형 응답을 그대로 유지합니다 — AI 챗봇과는 별개 기능입니다.
 *
 * "화장품 등록" 미니플로우: 사용자가 등록을 요청하면 다음 한 줄("브랜드 제품명")을
 * 화장대(ClosetContext)에 담는다. 이 구간은 서버 호출 없이 로컬에서 처리한다.
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

/** 챗봇 아바타 — 로봇 이모지 대신 사용자 본인의 캐릭터(피부타입 마스코트 + 꾸미기)를 보여준다 */
function BotAvatar({ skinType, decorationId }: { skinType: SkinType; decorationId: number | null }) {
  return (
    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 shadow overflow-hidden">
      <CharacterAvatar skinType={skinType} decorationId={decorationId} className="h-[85%] w-[85%]" />
    </div>
  );
}

/**
 * "**굵게**"만 지원하는 최소 마크다운 렌더러.
 * 시스템 프롬프트가 그 외 마크다운 기호는 안 쓰도록 지시하므로 그것만 처리한다.
 * 예전엔 텍스트를 그대로 찍어서 **별표**가 안 굵어지고 그대로 보였다.
 */
function renderWithBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

/** 카카오톡 식 "입력 중" 표시 — 챗봇이 응답을 준비하는 동안 보여준다 */
function TypingBubble({ skinType, decorationId }: { skinType: SkinType; decorationId: number | null }) {
  return (
    <div className="flex gap-2 mb-3 items-start">
      <BotAvatar skinType={skinType} decorationId={decorationId} />
      <div className="flex-1 max-w-[80%]">
        <span className="text-[11px] text-gray-50 mb-1 block">swappy · 입력 중</span>
        <div className="inline-flex items-center gap-1 bg-white rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl px-4 py-3.5 shadow-sm">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-gray-50 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const REGISTER_INTENT = /(화장품|제품).*(등록|추가)|등록.*(화장품|제품)|내 화장대에 담아/;

export default function ChatSupportPage() {
  const navigate = useNavigate();
  const { addItem } = useCloset();
  const { user: persona } = useAuth();
  const { skinType: diagType } = useDiagnosis();
  const skinType = diagType ?? persona?.skinType ?? DEFAULT_SKIN;
  const { decorationId } = useCharacter();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'bot', isWelcome: true },
    { id: 2, role: 'bot', isButtons: true },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(3);

  const pushBot = (text: string) =>
    setMessages((prev) => [...prev, { id: nextId.current++, role: 'bot', text }]);

  /**
   * 입력한 제품명을 카탈로그에서 찾아 화장대에 담는다.
   *
   * 예전에는 입력 문자열을 그대로 항목으로 만들고 id를 960001부터 붙였다.
   * 카탈로그에 없는 번호라 그 제품은 유사도 조회가 404로 떨어졌고,
   * 대체품을 영영 못 받았다 — 화장대에 담는 목적 자체가 대체품을 받는
   * 것인데 그게 안 됐다.
   *
   * 못 찾으면 담지 않고 다시 물어본다. 지어낸 제품을 담는 것보다 낫다.
   */
  const registerCosmetic = async (line: string) => {
    const keyword = line.trim();
    if (keyword.length < 2) {
      pushBot('제품명을 두 글자 이상 알려주세요.');
      setRegisterMode(true);
      return;
    }

    const found = await searchProducts(keyword, { size: 1 }).catch(() => null);
    const product = found?.items[0];

    if (!product) {
      pushBot(
        `'${keyword}'을(를) 찾지 못했어요.\n브랜드와 제품명을 함께 적어 주시면 더 잘 찾아요.\nex) 라운드랩 1025 독도 토너`,
      );
      setRegisterMode(true);
      return;
    }

    addItem({
      id: product.id,
      brand: product.brand,
      name: product.name,
      category: product.category,
      price: product.price,
      imageUrl: product.imageUrl,
      addedVia: 'chatbot',
      status: 'owned',
    });
    pushBot(
      `'${product.brand} ${product.name}'을(를) 화장대에 추가했어요! 🧴\n내 화장대에서 대체품 추천을 확인해 보세요.`,
    );
    setRegisteredCount((n) => n + 1);
  };

  const startRegister = () => {
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: 'user', text: '내 화장품 등록하기' },
      {
        id: nextId.current++,
        role: 'bot',
        text: '등록할 화장품의 브랜드와 제품명을 한 줄로 알려주세요.\nex) 이니스프리 그린티 씨드 세럼 80ml',
      },
    ]);
    setRegisterMode(true);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || isSending) return;

    const userText = inputText;
    const userMsg: Message = { id: nextId.current++, role: 'user', text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    // 화장품 등록 미니플로우 — 서버 호출 없이 로컬 처리
    if (registerMode) {
      void registerCosmetic(userText);
      setRegisterMode(false);
      return;
    }
    if (REGISTER_INTENT.test(userText)) {
      pushBot('등록할 화장품의 브랜드와 제품명을 한 줄로 알려주세요.\nex) 이니스프리 그린티 씨드 세럼 80ml');
      setRegisterMode(true);
      return;
    }

    setIsSending(true);

    // 서버에 보낼 대화 히스토리 (welcome/버튼 안내 메시지는 제외)
    const history = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role === 'bot' ? ('assistant' as const) : ('user' as const), content: m.text! }));

    try {
      const { reply } = await sendChatMessage({ message: userText, skin_type: skinType, history });
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
                <BotAvatar skinType={skinType} decorationId={decorationId} />
                <div className="flex-1 max-w-[80%]">
                  <span className="text-[11px] text-gray-50 mb-1 block">swappy · 방금 전</span>

                  {msg.isWelcome && (
                    <>
                      <div className="bg-gray-100 rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl px-5 pt-4 pb-2 mb-2 text-center">
                        <CharacterAvatar skinType={skinType} decorationId={decorationId} className="mx-auto h-16 w-16" />
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
                      <button
                        onClick={startRegister}
                        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-light py-2.5 text-xs font-bold text-primary-dark active:scale-[.98] transition-transform"
                      >
                        🧴 내 화장품 등록하기
                      </button>
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
                      {renderWithBold(msg.text)}
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

        {isSending && <TypingBubble skinType={skinType} decorationId={decorationId} />}

        <div ref={bottomRef} />
      </div>

      {registeredCount > 0 && (
        <button
          onClick={() => navigate('/closet')}
          className="mx-3 mb-2 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-white active:scale-[.98] transition-transform"
        >
          내 화장대 보기 ({registeredCount}개 등록됨)
        </button>
      )}

      <div className="bg-white border-t border-gray-20 px-3 py-2.5 flex items-center gap-2" style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}>
        <button
          onClick={startRegister}
          aria-label="내 화장품 등록"
          className="w-[34px] h-[34px] rounded-full border-[1.5px] border-gray-20 flex items-center justify-center shrink-0 text-gray-70"
        >
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
