import { motion } from 'framer-motion'

interface ChatBubbleProps {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatBubble({ role, content }: ChatBubbleProps) {
  const isUser = role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="mr-[2cqmin] mt-[0.5cqmin] flex-shrink-0">
          <div
            className="flex items-center justify-center rounded-full text-white font-doodle text-[2.2cqmin]"
            style={{
              width: 'clamp(28px, 7cqmin, 36px)',
              height: 'clamp(28px, 7cqmin, 36px)',
              background: '#2d7a4f',
            }}
          >
            S
          </div>
        </div>
      )}

      <div
        className="max-w-[75%] rounded-[4cqmin] px-[3.5cqmin] py-[2.5cqmin] text-[3.2cqmin] leading-relaxed"
        style={
          isUser
            ? { background: '#2d7a4f', color: '#fff', borderBottomRightRadius: '1.2cqmin', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
            : { background: '#f4e9d8', color: '#1a1a1a', borderBottomLeftRadius: '1.2cqmin', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
        }
      >
        {content}
      </div>
    </motion.div>
  )
}