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
}

export interface ChatResponse {
  reply: string;
}

export function sendChatMessage(
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  return postJson<ChatResponse>('/api/v1/chat', req, signal);
}
