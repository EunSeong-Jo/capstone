import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import ChatBubble from './ChatBubble'
import ChatInput from './ChatInput'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatScreenProps {
  skinTypeId: string | null
  onClose: () => void
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const WELCOME: Message = {
  role: 'assistant',
  content:
    '안녕하세요! 저는 Swappy 화장품 챗봇이에요 🌿\n' +
    '성분, 효능, 가격 비교, 대체품 추천까지 뭐든 물어보세요!',
}

export default function ChatScreen({ skinTypeId, onClose }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async (text: string) => {
    const userMsg: Message = { role: 'user', content: text }
    const history = messages.filter((m) => m !== WELCOME)

    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          skin_type: skinTypeId,
          history,
        }),
      })

      if (!res.ok) throw new Error(`서버 오류 (${res.status})`)
      const data: { reply: string } = await res.json()
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '죄송해요, 잠시 오류가 발생했어요. 다시 시도해 주세요 🙏' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      key="chat-screen"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      className="absolute inset-0 flex flex-col bg-white"
      style={{ zIndex: 50 }}
    >
      {/* 헤더 */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-[5cqmin] py-[4cqmin]"
        style={{ background: '#f4e9d8', borderBottom: '1px solid #e8ddc8' }}
      >
        <div className="flex items-center gap-[3cqmin]">
          <div
            className="flex items-center justify-center rounded-full font-doodle text-white text-[3cqmin]"
            style={{
              width: 'clamp(32px, 9cqmin, 42px)',
              height: 'clamp(32px, 9cqmin, 42px)',
              background: '#2d7a4f',
            }}
          >
            S
          </div>
          <div>
            <p className="font-semibold text-[3.5cqmin] text-gray-800">Swappy 챗봇</p>
            <p className="text-[2.6cqmin] text-gray-500">화장품 성분 · 추천 전문</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-[2cqmin] text-gray-500 transition-colors hover:bg-[#e8ddc8]"
          aria-label="닫기"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-[4cqmin] py-[4cqmin]" style={{ overscrollBehavior: 'contain' }}>
        <div className="flex flex-col gap-[3cqmin]">
          {messages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} content={msg.content} />
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="mr-[2cqmin] mt-[0.5cqmin] flex-shrink-0">
                <div
                  className="flex items-center justify-center rounded-full font-doodle text-white text-[2.2cqmin]"
                  style={{ width: 'clamp(28px, 7cqmin, 36px)', height: 'clamp(28px, 7cqmin, 36px)', background: '#2d7a4f' }}
                >
                  S
                </div>
              </div>
              <div
                className="flex items-center gap-[1.5cqmin] rounded-[4cqmin] px-[3.5cqmin] py-[2.5cqmin]"
                style={{ background: '#f4e9d8', borderBottomLeftRadius: '1.2cqmin' }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="block rounded-full bg-gray-400"
                    style={{ width: 7, height: 7 }}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 입력창 */}
      <div className="flex-shrink-0">
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </motion.div>
  )
}