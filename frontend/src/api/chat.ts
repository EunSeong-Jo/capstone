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

export interface ChatResponse {
  reply: string;
  /** 'fallback'이면 AI 키·장애로 서버가 저장된 정보(DB)로 답한 것 — 답변 첫 줄에 안내가 이미 들어 있다. */
  mode?: 'ai' | 'fallback';
}

export function sendChatMessage(
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  return postJson<ChatResponse>('/api/v1/chat', req, signal);
}
