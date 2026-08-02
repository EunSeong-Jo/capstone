import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import SplashScreen from './components/SplashScreen'
import OnboardingFlow from './components/onboarding/OnboardingFlow'

type Stage = 'splash' | 'onboarding' | 'main'

function App() {
  const [stage, setStage] = useState<Stage>('splash')

  return (
    <div className="device-frame">
      <AnimatePresence mode="wait">
        {stage === 'splash' && (
          <SplashScreen key="splash" onComplete={() => setStage('onboarding')} />
        )}
        {stage === 'onboarding' && (
          <OnboardingFlow key="onboarding" onComplete={() => setStage('main')} />
        )}
      </AnimatePresence>
      {stage === 'main' && (
        <div className="flex h-full w-full items-center justify-center bg-white">
          <p className="text-swappy-green">메인 화면 (연결 예정)</p>
        </div>
      )}
    </div>
  )
}

export default App
