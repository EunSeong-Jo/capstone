import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import SplashScreen from './components/SplashScreen'
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import MainScreen from './components/MainScreen'

type Stage = 'splash' | 'onboarding' | 'main'

function getInitialStage(): Stage {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('stage')
  return requested === 'main' ? 'main' : 'splash'
}

function App() {
  const [stage, setStage] = useState<Stage>(getInitialStage)
  const [skinTypeId, setSkinTypeId] = useState<string>('yuriguseul')

  const handleOnboardingComplete = (selectedTypeId: string) => {
    setSkinTypeId(selectedTypeId)
    setStage('main')
  }

  return (
    <div className="device-frame">
      <AnimatePresence mode="wait">
        {stage === 'splash' && (
          <SplashScreen key="splash" onComplete={() => setStage('onboarding')} />
        )}
        {stage === 'onboarding' && (
          <OnboardingFlow key="onboarding" onComplete={handleOnboardingComplete} />
        )}
      </AnimatePresence>
      {stage === 'main' && <MainScreen skinTypeId={skinTypeId} />}
    </div>
  )
}

export default App