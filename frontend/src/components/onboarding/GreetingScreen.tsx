import { motion } from 'framer-motion';
import baseDefault from '../../assets/base/base-default.png';
import MascotStage from './MascotStage';
import MessageBox from './MessageBox';
import OnboardingButton from './OnboardingButton';
import { GREETING_MESSAGES, GREETING_COUNT } from '../../data/onboarding';

interface GreetingScreenProps {
  greetingIndex: number;
  onAdvance: () => void;
  onKnow: () => void;
  onDontKnow: () => void;
}

export default function GreetingScreen({
  greetingIndex,
  onAdvance,
  onKnow,
  onDontKnow,
}: GreetingScreenProps) {
  const isLastMessage = greetingIndex === GREETING_COUNT - 1;

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-ob-bg"
      style={{
        paddingBottom: 'var(--safe-bottom)',
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
  );
}
