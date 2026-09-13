import { motion } from 'framer-motion'
import baseDefault from '../../assets/base/base-default.png'
import MascotStage from './MascotStage'
import MessageBox from './MessageBox'
import OnboardingButton from './OnboardingButton'

const GREETING_MESSAGES = [
  '안녕하세요 Swappy에 오신 여러분 환영합니다!!',
  '저는 여러분을 도와드릴 위피에요',
  '일단 여러분의 피부타입을 알기위해 몇가지 질문을 드릴께요~ 이미 피부 타입을 알고 계신가요?',
]

interface GreetingScreenProps {
  greetingIndex: number
  onAdvance: () => void
  onKnow: () => void
  onDontKnow: () => void
}

export default function GreetingScreen({ greetingIndex, onAdvance, onKnow, onDontKnow }: GreetingScreenProps) {
  const isLastMessage = greetingIndex === GREETING_MESSAGES.length - 1

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqmin]">
        <MascotStage src={baseDefault} alt="기본 캐릭터" />
        <MessageBox
          key={greetingIndex}
          text={GREETING_MESSAGES[greetingIndex]}
          onAdvance={isLastMessage ? undefined : onAdvance}
          footer={
            isLastMessage ? (
              <div className="flex gap-[3cqmin]">
                <OnboardingButton onClick={onKnow}>알아요!</OnboardingButton>
                <OnboardingButton variant="secondary" onClick={onDontKnow}>
                  아니요 몰라요
                </OnboardingButton>
              </div>
            ) : null
          }
        />
      </div>
    </motion.div>
  )
}
