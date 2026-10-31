/**
 * 챗봇 API.
 *
 * backend/app/api/chat.py는 schemas/의 camelCase 베이스를 쓰지 않고
 * 필드를 그대로 선언하므로, 이 요청/응답은 snake_case를 그대로 씁니다.
 */
import { postJson } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  skin_type?: string;
  history?: ChatMessage[];
  /** 마이 성분 이름(기기에만 있어 실어 보낸다). 로그인한 사용자의 개인 요약에만 쓰이고 비회원 요청에서는 무시된다. */
  my_ingredients?: string[];
}

/** 답변 아래에 보여 주는 제품 카드(AI가 도구로 찾아 말한 제품). */
export interface ChatProductCard {
  id: number;
  name: string;
  brand: string;
  category: string;
  price: number;
  imageUrl?: string | null;
  rating?: number | null;
  /** 내 피부 궁합 점수(0~100). 피부타입이 있고 계산된 제품만 */
  fitScore?: number | null;
}

/** "담을까요?" 제안. 서버는 담지 않는다 — 사용자가 버튼을 눌러야 담긴다. */
export interface ChatAction {
  type: 'add_to_cart' | 'add_to_closet';
  productId: number;
  label: string;
}

export interface ChatResponse {
  reply: string;
  cards?: ChatProductCard[];
  actions?: ChatAction[];
  /** 'fallback'이면 AI 키·장애로 서버가 저장된 정보(DB)로 답한 것 — 답변 첫 줄에 안내가 이미 들어 있다. */
  mode?: 'ai' | 'fallback';
}

export function sendChatMessage(
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  return postJson<ChatResponse>('/api/v1/chat', req, signal);
}
