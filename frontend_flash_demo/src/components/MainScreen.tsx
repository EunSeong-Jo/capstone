import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ChatScreen from './chat/ChatScreen'
import { skinTypes } from '../data/skinTypes'

interface MainScreenProps {
  skinTypeId: string
}

export default function MainScreen({ skinTypeId }: MainScreenProps) {
  const [chatOpen, setChatOpen] = useState(false)
  const skinType = skinTypes.find((t) => t.id === skinTypeId)

  return (
    <div className="relative flex h-full w-full flex-col bg-white">
      {/* 홈 화면 본문 — 추후 팀원이 채울 영역 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-[4cqmin] px-[6cqmin]">
        {skinType && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col items-center gap-[3cqmin]"
          >
            <img
              src={skinType.image}
              alt={skinType.label}
              className="object-contain"
              style={{ width: 'clamp(80px, 25cqmin, 120px)' }}
            />
            <p className="font-doodle text-[4.5cqmin] text-swappy-green">{skinType.label}</p>
            <p className="text-center text-[3.2cqmin] text-gray-500">{skinType.description}</p>
          </motion.div>
        )}

        <p className="mt-[4cqmin] text-center text-[3cqmin] text-gray-400">
          홈 화면은 추후 연결 예정이에요
        </p>
      </div>

      {/* 플로팅 챗봇 버튼 */}
      <AnimatePresence>
        {!chatOpen && (
          <motion.button
            key="chat-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={() => setChatOpen(true)}
            className="absolute flex flex-col items-center gap-[1cqmin] rounded-[5cqmin] px-[3.5cqmin] py-[2.5cqmin] shadow-lg"
            style={{
              bottom: 'max(env(safe-area-inset-bottom), 6cqmin)',
              right: '5cqmin',
              background: '#2d7a4f',
              zIndex: 40,
            }}
            aria-label="챗봇 열기"
          >
            {/* 채팅 아이콘 */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-white text-[2.6cqmin] font-semibold">챗봇</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* 챗봇 화면 */}
      <AnimatePresence>
        {chatOpen && (
          <ChatScreen
            key="chat"
            skinTypeId={skinTypeId}
            onClose={() => setChatOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}