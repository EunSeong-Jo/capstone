import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { skinTypes, RESULT_TYPE_ID } from '../../data/skinTypes'
import type { SkinType } from '../../data/skinTypes'
import GreetingScreen from './GreetingScreen'
import TypeGridScreen from './TypeGridScreen'
import WorriedScreen from './WorriedScreen'
import QnaPlaceholder from './QnaPlaceholder'
import LoadingScreen from './LoadingScreen'
import ResultMessageScreen from './ResultMessageScreen'
import ResultScreen from './ResultScreen'

type Step = 'greeting' | 'grid' | 'worried' | 'qna' | 'loading' | 'result' | 'resultCard'

const resultType = skinTypes.find((t) => t.id === RESULT_TYPE_ID)!

export default function OnboardingFlow({ onComplete }: { onComplete: (selectedTypeId: string) => void }) {
  const [step, setStep] = useState<Step>('greeting')
  const [greetingIndex, setGreetingIndex] = useState(0)
  const [selectedType, setSelectedType] = useState<SkinType>(skinTypes[0])

  return (
    <AnimatePresence mode="wait">
      {step === 'greeting' && (
        <GreetingScreen
          key="greeting"
          greetingIndex={greetingIndex}
          onAdvance={() => setGreetingIndex((i) => i + 1)}
          onKnow={() => setStep('grid')}
          onDontKnow={() => setStep('worried')}
        />
      )}
      {step === 'grid' && (
        <TypeGridScreen
          key="grid"
          selectedType={selectedType}
          onSelect={setSelectedType}
          onConfirm={() => onComplete(selectedType.id)}
        />
      )}
      {step === 'worried' && <WorriedScreen key="worried" onAdvance={() => setStep('qna')} />}
      {step === 'qna' && <QnaPlaceholder key="qna" onAdvance={() => setStep('loading')} />}
      {step === 'loading' && (
        <LoadingScreen
          key="loading"
          onComplete={() => {
            setSelectedType(resultType)
            setStep('result')
          }}
        />
      )}
      {step === 'result' && (
        <ResultMessageScreen
          key="result"
          resultType={selectedType}
          onAdvance={() => setStep('resultCard')}
        />
      )}
      {step === 'resultCard' && (
        <ResultScreen
          key="resultCard"
          resultType={selectedType}
          onConfirm={() => onComplete(selectedType.id)}
          onRetry={() => setStep('qna')}
        />
      )}
    </AnimatePresence>
  )
}
