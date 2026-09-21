import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { DiagnosisProvider } from './context/DiagnosisContext.tsx'
import { ClosetProvider } from './context/ClosetContext.tsx'
import { CartProvider } from './context/CartContext.tsx'
import { LikedProductsProvider } from './context/LikedProductsContext.tsx'
import { UserProfileProvider } from './context/UserProfileContext.tsx'
import { CharacterProvider } from './context/CharacterContext.tsx'
import { ExperienceProvider } from './context/ExperienceContext.tsx'
import { ToastProvider } from './components/ui/ToastContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <DiagnosisProvider>
          <ClosetProvider>
            <CartProvider>
              {/* UserProfileProvider는 AuthProvider 안쪽이다. 지금은 어떤 컨텍스트도
                  참조하지 않지만, 시드를 MOCK_PROFILE에서 로그인 응답으로 바꿀 때
                  (UserProfileContext.tsx의 TODO) useAuth에 닿을 수 있어야 한다. */}
              <UserProfileProvider>
                <CharacterProvider>
                  <ExperienceProvider>
                    <LikedProductsProvider>
                      <ToastProvider>
                        <App />
                      </ToastProvider>
                    </LikedProductsProvider>
                  </ExperienceProvider>
                </CharacterProvider>
              </UserProfileProvider>
            </CartProvider>
          </ClosetProvider>
        </DiagnosisProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
