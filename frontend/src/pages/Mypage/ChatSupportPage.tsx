import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { searchProducts } from '../../api/products';
import { sendChatMessage, type ChatAction, type ChatProductCard } from '../../api/chat';
import { ApiError } from '../../api/client';
import { useCart } from '../../context/cart';
import { useCloset } from '../../context/closet';
import { useToast } from '../../context/toast';
import { useCharacter } from '../../context/character';
import { CharacterAvatar } from '../../components/character/CharacterAvatar';
import { useMyIngredients } from '../../hooks/useMyIngredients';
import { useSkinType } from '../../hooks/useSkinType';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { readJSON, writeJSON } from '../../context/storage';
import type { SkinType } from '../../types';

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
  /** 화장품 등록 완료 메시지. 이 메시지가 마지막일 때만 '내 화장대 보기'를 붙인다. */
  closetLink?: boolean;
  /** 등록 안내 메시지. 마지막 메시지일 때만 '제품 앞면 찍어서 등록' 버튼을 붙인다. */
  scanLink?: boolean;
  /** AI가 도구로 찾아 말한 제품 카드 */
  cards?: ChatProductCard[];
  /** "담을까요?" 제안(누르기 전에는 아무것도 담기지 않는다) */
  actions?: ChatAction[];
}

/**
 * 예전엔 6쌍(12개) 전부 눌러도 "문의를 접수했습니다"만 반복됐다 — 실제로
 * 아무 동작도 안 하는 가짜 버튼이었다. 개수를 줄이고, 각 항목이 실제로
 * 쓸모 있는 동작(진단 화면 이동 / 사용법 안내 / 챗봇 성분 질문 유도)을
 * 하도록 바꿨다.
 */
const quickButtons: { key: 'diagnosis' | 'guide' | 'ingredient'; label: string }[] = [
  { key: 'diagnosis', label: '🧬 피부타입 진단하기' },
  { key: 'guide', label: '📱 어플 사용법' },
  { key: 'ingredient', label: '🧪 성분이 궁금해요' },
];

/** 챗봇 아바타 — 로봇 이모지 대신 사용자 본인의 캐릭터(피부타입 마스코트 + 꾸미기)를 보여준다.
 *  배경은 Mypage/ProfileDashboard의 캐릭터 원형 아이콘과 동일하게 흰 배경 + 연한 테두리로 맞춘다 —
 *  bg-gray-100이 이 팔레트에서 #111827(거의 검정)이라 캐릭터 이미지 뒤에서 도드라져 보였다. */
function BotAvatar({
  skinType,
  decorationId,
}: {
  /** 진단 전이면 null — CharacterAvatar가 범용 얼굴을 그린다. */
  skinType: SkinType | null;
  decorationId: number | null;
}) {
  return (
    <div className="w-10 h-10 rounded-full bg-white border border-gray-20 flex items-center justify-center shrink-0 shadow overflow-hidden">
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
function TypingBubble({
  skinType,
  decorationId,
}: {
  /** 진단 전이면 null — CharacterAvatar가 범용 얼굴을 그린다. */
  skinType: SkinType | null;
  decorationId: number | null;
}) {
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

/**
 * 비회원이 답을 받을 수 있는 질문 수. 챗봇은 LLM 호출이라 비용이 들고, 대화 기록은
 * 개인 데이터라 계속 쓰려면 로그인하게 한다. 맛보기로 몇 번은 열어 둔다.
 * 기기(localStorage)에 세므로 새로고침해도 이어서 센다.
 */
const GUEST_CHAT_LIMIT = 3;
const GUEST_CHAT_KEY = 'swappy:chat-guest:v1';

export default function ChatSupportPage() {
  const navigate = useNavigate();
  const { addItem, hasItem } = useCloset();
  const { addToCart, inCart } = useCart();
  const { showToast } = useToast();
  const { isUser, requireLogin, goLogin } = useLoginPrompt();
  const [guestUsed, setGuestUsed] = useState(() => readJSON<number>(GUEST_CHAT_KEY, 0));
  const guestLimitReached = !isUser && guestUsed >= GUEST_CHAT_LIMIT;
  /**
   * 진단 전이면 null이다. 예전에는 `?? 'ondalsam'`이라 **진단을 한 적이 없는
   * 사용자의 챗봇 아바타가 옹달샘으로** 나왔고, 서버에도 그 타입으로 물었다.
   */
  const { skinType } = useSkinType();
  const { items: myIngredients } = useMyIngredients();
  const { decorationId } = useCharacter();
  // 예전엔 "2026년 6월 25일"이 하드코딩돼 있어서 날짜가 바뀌어도 그대로였다.
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    [],
  );
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  /**
   * "+" 버튼 — 빠른 버튼(등록·진단·사용법·성분)을 언제든 다시 여는 메뉴. 예전엔 "내 화장품 등록하기" FAQ 버튼과 똑같은 동작을 호출해서
   * 사용자가 어느 쪽을 눌러도 같은 안내만 반복됐다("현재 내 화장품 등록하기" 말이
   * 반복되는 중). 카톡처럼 첨부 메뉴를 열어 "사진으로 등록"과 "직접 입력"을
   * 구분한다 — 이 앱엔 이미 앞면 사진으로 제품을 찾는 기능(/scan)이 있으니 활용한다.
   */
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'bot', isWelcome: true },
    { id: 2, role: 'bot', isButtons: true },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(3);

  const pushBot = (text: string, extra?: Pick<Message, 'closetLink' | 'scanLink' | 'cards'>) =>
    setMessages((prev) => [...prev, { id: nextId.current++, role: 'bot', text, ...extra }]);

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
      pushBot('제품명을 두 글자 이상 입력해 주세요.', { scanLink: true });
      setRegisterMode(true);
      return;
    }

    const found = await searchProducts(keyword, { size: 1 }).catch(() => null);
    const product = found?.items[0];

    if (!product) {
      pushBot(
        `'${keyword}'은(는) 찾지 못했어요.\n브랜드와 제품명을 함께 적거나, 제품 앞면을 찍어서 등록해 보세요.\n예) 라운드랩 1025 독도 토너`,
        { scanLink: true },
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
    // 어떤 제품이 담겼는지 카드로 보여 준다(AI 답변의 제품 카드와 같은 모양)
    pushBot('화장대에 추가했어요.\n내 화장대에서 대체품 추천도 받아 보세요.', {
      closetLink: true,
      cards: [
        {
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          price: product.price,
          imageUrl: product.imageUrl ?? null,
          rating: product.rating ?? null,
        },
      ],
    });
  };

  const startRegister = () => {
    if (requireLogin('화장품 등록은 로그인하면 쓸 수 있어요')) return;
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: 'user', text: '내 화장품 등록하기' },
      {
        id: nextId.current++,
        role: 'bot',
        text: '어떤 화장품을 등록할까요?\n브랜드와 제품명을 입력하거나, 제품 앞면을 찍어서 등록할 수 있어요.\n예) 라운드랩 1025 독도 토너',
        scanLink: true,
      },
    ]);
    setRegisterMode(true);
  };

  const openScanRegister = () => {
    setShowAttachMenu(false);
    navigate('/scan');
  };

  const openManualRegister = () => {
    setShowAttachMenu(false);
    startRegister();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || isSending || guestLimitReached) return;

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
      if (!isUser) {
        pushBot('화장품 등록은 로그인하면 쓸 수 있어요. 로그인하면 내 화장대에 바로 담아 드릴게요.');
        requireLogin('화장품 등록은 로그인하면 쓸 수 있어요');
        return;
      }
      pushBot(
        '어떤 화장품을 등록할까요?\n브랜드와 제품명을 입력하거나, 제품 앞면을 찍어서 등록할 수 있어요.\n예) 라운드랩 1025 독도 토너',
        { scanLink: true },
      );
      setRegisterMode(true);
      return;
    }

    if (!isUser) {
      const used = guestUsed + 1;
      writeJSON(GUEST_CHAT_KEY, used);
      setGuestUsed(used);
    }
    setIsSending(true);

    // 서버에 보낼 대화 히스토리 (welcome/버튼 안내 메시지는 제외)
    const history = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role === 'bot' ? ('assistant' as const) : ('user' as const), content: m.text! }));

    try {
      const { reply, cards, actions } = await sendChatMessage({
        message: userText,
        skin_type: skinType ?? undefined,
        history,
        my_ingredients: myIngredients.map((i) => i.name).slice(0, 20),
      });
      const botReply: Message = { id: nextId.current++, role: 'bot', text: reply, cards, actions };
      setMessages((prev) => [...prev, botReply]);
    } catch (err) {
      // 비회원 한도는 서버도 센다(IP 기준). 기기 카운터를 지웠어도 서버가 막으면
      // 입력창을 닫고 로그인 안내를 띄운다.
      if (!isUser && err instanceof ApiError && err.status === 401) {
        writeJSON(GUEST_CHAT_KEY, GUEST_CHAT_LIMIT);
        setGuestUsed(GUEST_CHAT_LIMIT);
      }
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

  /** AI가 제안한 담기를 사용자가 눌렀을 때만 실행한다. 카드에 제품 정보가 있으니 서버를 다시 부르지 않는다. */
  const runAction = (action: ChatAction, card?: ChatProductCard) => {
    if (!card) return;
    if (action.type === 'add_to_cart') {
      addToCart({ id: card.id, name: card.name, brand: card.brand, price: card.price, imageUrl: card.imageUrl ?? undefined });
      showToast('장바구니에 담았어요');
    } else {
      addItem({
        id: card.id, brand: card.brand, name: card.name, category: card.category, price: card.price,
        imageUrl: card.imageUrl ?? undefined, addedVia: 'chatbot', status: 'owned',
      });
      showToast('화장대에 담았어요');
    }
  };

  const handleQuickBtn = (btn: (typeof quickButtons)[number]) => {
    setMessages((prev) => [...prev, { id: nextId.current++, role: 'user', text: btn.label }]);

    if (btn.key === 'diagnosis') {
      pushBot('피부타입 진단 화면으로 이동할게요! 몇 가지 질문에 답하면 내 피부타입을 알 수 있어요.');
      // /onboarding은 진단을 마친 사용자를 홈으로 돌려보내서(skipGreeting) 재진단은 /qna로 보낸다
      navigate('/qna');
      return;
    }

    if (btn.key === 'guide') {
      pushBot(
        'Swappy는 이렇게 쓰시면 돼요.\n\n' +
          '**1. 피부타입 진단**\n' +
          '질문에 답하거나 얼굴 사진을 찍으면 내 피부타입을 알 수 있어요. 마이페이지의 피부타입 재진단과 AI 피부관리에서 할 수 있어요.\n\n' +
          '**2. 내 화장대 등록**\n' +
          '쓰는 제품을 등록하면 그 제품과 성분이 비슷한 대체품을 찾아 드려요. 제품명을 입력하거나 제품 앞면을 찍으면 돼요.\n\n' +
          '**3. 오늘의 교체 제안**\n' +
          '홈에서 더 저렴하거나 내 피부에 더 잘 맞는 대체품을 확인하고, 담기 전에 성분 비교로 차이를 살펴볼 수 있어요.\n\n' +
          '**4. 성분 비교**\n' +
          '제품 상세의 "다른 제품과 성분 비교하기"로 두 제품의 성분 차이를 직접 견줘 볼 수 있어요.\n\n' +
          '**5. 챗봇**\n' +
          '제품 추천, 성분 질문, 예산에 맞는 루틴 짜기를 도와 드려요.\n\n' +
          '입력창 옆 + 버튼에서 이 메뉴를 언제든 다시 열 수 있어요.',
      );
      return;
    }

    pushBot(
      '성분 이름을 몰라도 괜찮아요. 효과나 고민으로 물어보셔도 돼요.\n\n' +
        '예) 나이아신아마이드가 뭐예요?\n' +
        '예) 진정 성분이 뭐야?',
    );
  };

  return (
    <PageWrapper>
      <Header showBack title="채팅 상담" />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex justify-center mb-5">
          <span className="text-xs text-gray-70 bg-black/[.08] px-3.5 py-1.5 rounded-full">{todayLabel}</span>
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
                      <div className="bg-gray-5 rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl px-5 pt-4 pb-2 mb-2 text-center">
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
                        ✔ 문장으로 편하게 물어보세요.
                        <br />
                        예) 내 피부에 맞는 토너 추천해줘
                        <br />
                        <br />
                        ✔ 제품명을 넣어 물어보셔도 돼요.
                        <br />
                        예) 라운드랩 독도 토너랑 비슷한데 더 싼 거 있어?
                        <br />
                        <br />
                        ✔ 내 화장대·피부 상태·예산을 알고 답해요.
                        <br />
                        예) 7만원으로 루틴 짜줘, 오늘 뭐 발라야 해?
                        <br />
                        <br />
                        ✔ 주문·배송은 직접 처리하지 못해서 주문내역과 고객센터로 안내해요.
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
                      <div className="flex flex-col gap-1.5">
                        {quickButtons.map((btn) => (
                          <button
                            key={btn.key}
                            onClick={() => handleQuickBtn(btn)}
                            className="py-2.5 px-3 rounded-lg border border-gray-20 text-xs text-gray-100 text-left leading-snug"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.text && (
                    <div className="bg-white rounded-tl-[4px] rounded-tr-2xl rounded-b-2xl px-3.5 py-3 shadow-sm text-[13px] text-gray-100 leading-relaxed whitespace-pre-line">
                      {renderWithBold(msg.text)}
                    </div>
                  )}

                  {msg.cards && msg.cards.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      {msg.cards.map((c) => {
                        const action = msg.actions?.find((a) => a.productId === c.id);
                        const done = action ? (action.type === 'add_to_cart' ? inCart(c.id) : hasItem(c.id)) : false;
                        return (
                          <div key={c.id} className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 shadow-sm">
                            <button
                              type="button"
                              onClick={() => navigate(`/detail/${c.id}`)}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-5">
                                {c.imageUrl && <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[11px] text-gray-50">{c.brand}</span>
                                <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-gray-100">{c.name}</span>
                                <span className="mt-0.5 block text-[12px] font-bold text-gray-100">
                                  {c.price.toLocaleString()}원
                                  {c.fitScore != null && <span className="ml-1.5 font-semibold text-primary">궁합 {c.fitScore}점</span>}
                                </span>
                              </span>
                            </button>
                            {action && (
                              <button
                                type="button"
                                disabled={done}
                                onClick={() => runAction(action, c)}
                                className="shrink-0 rounded-full bg-primary px-3 py-2 text-[11px] font-bold text-white active:scale-95 disabled:bg-gray-20 disabled:text-gray-50"
                              >
                                {done ? '담았어요' : '담기'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 예전에는 입력창 위에 고정된 버튼이라 다른 대화로 넘어가도 계속
                      남아 있었다(QA 9). 등록 완료 메시지에 붙이고, 다음 메시지가
                      오면 사라진다. */}
                  {/* 등록 안내 메시지가 마지막일 때만. 사진으로 찾는 스캔 화면(/scan)으로 보낸다. */}
                  {msg.scanLink && msg.id === messages[messages.length - 1]?.id && (
                    <button
                      onClick={openScanRegister}
                      className="mt-2 flex w-full items-center justify-center rounded-lg border border-gray-20 bg-white py-2.5 text-xs font-bold text-gray-100 active:scale-[.98] transition-transform"
                    >
                      제품 앞면 찍어서 등록
                    </button>
                  )}

                  {msg.closetLink && msg.id === messages[messages.length - 1]?.id && (
                    <button
                      onClick={() => navigate('/closet')}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-white active:scale-[.98] transition-transform"
                    >
                      내 화장대 보기
                    </button>
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

      {guestLimitReached && (
        <div className="mx-3 mb-2 rounded-xl bg-gray-5 px-3 py-3 text-center">
          <p className="text-[12px] text-gray-70">
            로그인하면 챗봇과 계속 대화할 수 있어요. 내 피부타입과 화장대에 맞춰 답해 드려요.
          </p>
          <button
            onClick={goLogin}
            className="mt-2 rounded-full px-4 py-2 text-[12px] font-bold text-white active:scale-95 transition-transform"
            style={{ background: '#00916D' }}
          >
            로그인하고 계속 대화하기
          </button>
        </div>
      )}

      <div className="bg-white border-t border-gray-20 px-3 py-2.5 flex items-center gap-2" style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}>
        <div className="relative shrink-0">
          {showAttachMenu && (
            <>
              {/* 바깥을 탭하면 메뉴 닫힘 */}
              <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
              <div className="absolute bottom-[42px] left-0 w-52 rounded-xl border border-gray-20 bg-white shadow-lg overflow-hidden z-20">
                <button
                  onClick={openManualRegister}
                  className="flex w-full items-center gap-2 px-3 py-3 text-xs text-gray-100 active:bg-gray-5"
                >
                  🧴 내 화장품 등록하기
                </button>
                {/* 처음 화면의 빠른 버튼과 같은 메뉴 — 대화가 길어져 위로 올라가도 여기서 다시 누를 수 있다 */}
                {quickButtons.map((btn) => (
                  <button
                    key={btn.key}
                    onClick={() => {
                      setShowAttachMenu(false);
                      handleQuickBtn(btn);
                    }}
                    className="flex w-full items-center gap-2 border-t border-gray-20 px-3 py-3 text-xs text-gray-100 active:bg-gray-5"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => setShowAttachMenu((v) => !v)}
            aria-label="추가 기능"
            aria-expanded={showAttachMenu}
            className="relative z-20 w-[34px] h-[34px] rounded-full border-[1.5px] border-gray-20 flex items-center justify-center shrink-0 text-gray-70"
          >
            {showAttachMenu ? '×' : '+'}
          </button>
        </div>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          disabled={isSending || guestLimitReached}
          placeholder={
            guestLimitReached
              ? '로그인하면 계속 대화할 수 있어요'
              : isSending
                ? '답변을 기다리는 중...'
                : '버튼을 선택하거나 메시지를 입력하세요'
          }
          className="flex-1 border border-gray-20 rounded-full px-3.5 py-2.5 text-[13px] text-gray-100 bg-gray-5 outline-none disabled:opacity-60"
        />
        <button
          onClick={sendMessage}
          disabled={isSending || guestLimitReached}
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
